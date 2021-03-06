#!/usr/bin/env node
'use strict';
const path = require('path');
const fs = require('fs');
const meow = require('meow');
const inquirer = require('inquirer');
const globby = require('globby');
const getEmails = require('get-emails');
const chalk = require('chalk');
const Conf = require('conf');
const execa = require('execa');
const logSymbols = require('log-symbols');

const config = new Conf({
	defaults: {
		language: 'en'
	}
});

let filename = 'code-of-conduct';
const extension = '.md';

const cli = meow(`
	Usage
	  $ conduct

	Example
	  $ conduct --language=de

	Options
	  --uppercase, -c   Use uppercase characters (e.g. CODE-OF-CONDUCT.md)
	  --underscore, -u  Use underscores instead of dashes (e.g. code_of_conduct.md)
	  --language, -l    The language of the Code of Conduct [Default: en]
`, {
	flags: {
		uppercase: {
			type: 'boolean',
			default: false,
			alias: 'c'
		},
		underscore: {
			type: 'boolean',
			default: false,
			alias: 'u'
		},
		language: {
			type: 'string',
			alias: 'l'
		}
	}
});

function readmeIsUpperCase() {
	const results = globby.sync('readme.*', {case: false});
	if (results.length > 0) {
		const fileObj = path.parse(results[0]);
		return fileObj.name.toUpperCase() === fileObj.name;
	}
	return false;
}

const {flags} = cli;

if (flags.email) {
	config.set('email', flags.email);
}

if (flags.uppercase || readmeIsUpperCase()) {
	filename = filename.toUpperCase();
}

if (flags.underscore) {
	filename = filename.replace(/-/g, '_');
}

if (typeof flags.language === 'string') {
	const language = flags.language.toLowerCase();
	const availableLanguages = loadLanguages();

	if (!availableLanguages.has(language)) {
		console.error(`${logSymbols.error} Unsupported language '${language}' was provided. Conduct currently supports:\n\n${[...availableLanguages].sort().join(', ')}`);
		process.exit(1);
	}

	config.set('language', language);
}

const filepath = `${filename}${extension}`;

function loadLanguages() {
	const vendorFiles = fs.readdirSync(path.join(__dirname, 'vendor'));
	const languages = vendorFiles.map(file => file.match(/\.([a-z-]+)\.md/)[1]);
	return new Set(languages);
}

function findEmail() {
	let email;
	try {
		email = execa.sync('git', ['config', 'user.email']).stdout.trim();
	} catch (_) {}

	return email;
}

function write(filepath, email, fileToRemove) {
	const target = `vendor/code-of-conduct.${config.get('language')}.md`;
	const src = fs.readFileSync(path.join(__dirname, target), 'utf8');
	fs.writeFileSync(filepath, src.replace('[INSERT EMAIL ADDRESS]', email));

	if (fileToRemove) {
		fs.unlinkSync(fileToRemove);
		console.log(`${logSymbols.warning} Deleted ${fileToRemove}`);
	}
}

function generate(filepath, email) {
	write(filepath, email);
	console.log(`${logSymbols.success} Added a Code of Conduct to your project ❤️\n\n${chalk.bold('Please carefully read this document and be ready to enforce it.')}\n\nAdd the following to your contributing.md or readme.md:\nPlease note that this project is released with a [Contributor Code of Conduct](${filepath}). By participating in this project you agree to abide by its terms.`);
}

async function init() {
	const results = globby.sync([
		'code_of_conduct.*',
		'code-of-conduct.*',
		'.github/code_of_conduct.*',
		'.github/code-of-conduct.*'
	], {nocase: true});

	// Update existing
	if (results.length > 0) {
		const [existing] = results;
		const existingSrc = fs.readFileSync(existing, 'utf8');
		const [email] = [...getEmails(existingSrc)];

		if (cli.flags.underscore || cli.flags.uppercase) {
			// If the existing file is different from the
			// intended file, pass it in for removal
			write(filepath, cli.flags.email || email, existing !== filepath && existing);
		} else {
			// Otherwise, just update the original
			write(existing, cli.flags.email || email);
		}

		console.log(`${logSymbols.success} Updated your Code of Conduct`);
		return;
	}

	if (config.has('email')) {
		generate(filepath, config.get('email'));
		return;
	}

	const email = findEmail();
	if (email) {
		config.set('email', email);
		generate(filepath, email);
		return;
	}

	if (process.stdout.isTTY) {
		const answers = await inquirer.prompt([{
			type: 'input',
			name: 'email',
			message: `Couldn't infer your email. Please enter your email:`,
			validate: x => x.includes('@')
		}]);
		generate(filepath, answers.email);
	} else {
		console.error(`Run \`${chalk.cyan('conduct --email=your@email.com')}\` once to save your email.`);
		process.exit(1);
	}
}

init();
