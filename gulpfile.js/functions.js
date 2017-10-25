'use strict';

function isObject(item) {
	return (item && typeof item === 'object' && !Array.isArray(item) && item !== null);
}

function mergeDeep(target, source) {
	if (isObject(target) && isObject(source)) {
		Object.keys(source).forEach(key => {
			if (isObject(source[key])) {
				if (!target[key]) {
					Object.assign(target, { [key]: {} });
				}
				mergeDeep(target[key], source[key]);
			} else {
				Object.assign(target, { [key]: source[key] });
			}
		});
	}
	return target;
}

function globalImport(target, module) {
	if (!module) {
		module = target;

		if (target.indexOf('gulp-') === 0) {
			target = target.replace('gulp-', '');
		}
	}
	if (typeof module === 'string' && typeof target === 'string') {
		global[target] = require(module);
	}
}

function getTimestamp() {
	let timestamp;
	let now = new Date();
	timestamp  = now.getFullYear().toString();
	timestamp += '-';
	timestamp += (now.getMonth() < 9 ? '0' : '') + (now.getMonth() + 1).toString();
	timestamp += '-';
	timestamp += (now.getDate() < 10 ? '0' : '') + now.getDate().toString();
	timestamp += ' ';
	timestamp += (now.getHours() < 10 ? '0' : '') + now.getHours().toString();
	timestamp += ':';
	timestamp += (now.getMinutes() < 10 ? '0' : '') + now.getMinutes().toString();
	//timestamp += ':';
	//timestamp += (now.getSeconds() < 10 ? '0' : '') + now.getSeconds().toString();
	return timestamp;
}

function getExtensions(extensions, prepend = '') {
	if (Array.isArray(extensions)) {
		return '/' + prepend + '*.' + (extensions.length > 1 ? '{' + extensions.join(',') + '}' : extensions);
	} else {
		return '/' + prepend + '*.' + extensions;
	}
}

function getInfoFromComposer(path = '') {
	try {
		let composer = require(`${process.cwd()}/${path}composer.json`);
		let author   = composer.author ? composer.author : config.info.author;
		if (composer.description && composer.homepage) {
			config.info = {
				description: composer.description,
				author: author,
				system: config.info.system,
				homepage: composer.homepage
			};
		}
	} catch (error) {}
};

function mergeRootConfig(filename) {
	try {
		const configLocation = `${process.cwd()}/${filename}`;
		const configFromRoot = require(configLocation);
		mergeDeep(config, configFromRoot);
		console.info(`Loaded root config file from ${util.colors.red(configLocation)}`);
	} catch (error) {
	}
}

function getFolderSiteName(files) {
	for (var i = 0; i < files.length; i++) {
		if (!files[i].startsWith('.') && !files[i].startsWith('_')) {
			return files[i];
		}
	}
	return false;
}

function mergeSiteConfig(path) {
	const files = fs.readdirSync(path);
	const siteFolder = getFolderSiteName(files);

	try {
		const packageConfig = require(`${process.cwd()}/${path}/${siteFolder}/Configuration/Gulp.json`);
		mergeDeep(config, packageConfig);
		console.info(`Loaded config file ${util.colors.red('Gulp.json')} from the package ${util.colors.red(siteFolder)}`);
	} catch (error) {
	}
	try {
		getInfoFromComposer(`${path}/${siteFolder}/`);
	} catch (error) {
	}
}

function loadTasks() {
	setMode();
	require('./tasks');
}

function mergeConfigAndLoadTasks() {
	importLibs();
	getInfoFromComposer();
	mergeRootConfig('gulp.json');
	try {
		mergeSiteConfig('Packages/Sites');
	} catch (error) {
	}

	if (config.browserSync.enable) {
		delete config.browserSync.enable;
		browserSync = require('browser-sync').create();
	}

	loadTasks();
}

function setMode() {
	const env = util.env;

	global.mode = {
		beautify: env.beautify || env.b ? true : false,
		minimize: env.debug    || env.d ? false : true,
		maps:     env.maps     || env.debug || env.m || env.d ? true : false,
		debug:    env.debug    || env.d ? true : false
	};
}

function importLibs() {
	globalImport('gulp');
	// Gulp Plugins
	globalImport('cache', 'gulp-memory-cache');
	globalImport('gulp-changed');
	globalImport('gulp-chmod');
	globalImport('gulp-flatten');
	globalImport('gulp-header');
	globalImport('gulp-imagemin');
	globalImport('gulp-plumber');
	globalImport('gulp-rename');
	globalImport('gulp-size');
	globalImport('gulp-sourcemaps');
	globalImport('gulp-util');

	globalImport('handleErrors', './handleErrors');
}

function shureArray(input) {
	let array = input;
	// Make shure it's an array
	if (typeof input === 'string') {
		array = [input];
	}
	return array;
}

function getFilesToWatch(taskName) {
	let conf         = config.tasks[taskName];
	let watchConfig  = shureArray(config.root.watch);
	let dontWatch    = shureArray(config.root.dontWatch);
	let filesToWatch = [];

	if (conf && watchConfig && watchConfig.length) {
		if (conf.watchOnlySrc) {
			filesToWatch.push(path.join(config.root.base, config.root.src, conf.src, '/**', getExtensions(conf.extensions)));
		} else {
			filesToWatch = watchConfig.map(value => path.join(config.root.base, value, getExtensions(conf.extensions)));
		}

		if (dontWatch && dontWatch.length) {
			dontWatch.forEach(value => {
				if (value) {
					filesToWatch.push('!' + path.join(config.root.base, value, getExtensions(conf.extensions)));
				}
			});
		}

		if (taskName == 'css') {
			watchConfig.forEach(value => {
				filesToWatch.push('!' + path.join(config.root.base, value, '**/_{all,allsub}.scss'));
			});
		}
	}
	return filesToWatch;
}

function pluralize(string, count) {
	if (count > 1) {
		string += 's';
	}
	return string;
}

function notifyText(object) {
	if (object.warning	|| object.error || object.warnings	|| object.errors) {
		let warning;
		let message = ' found';
		let hasError = (object.error || object.errors) ? true : false;
		let options = {
			title: hasError ? 'Error' : 'Warning',
			icon: hasError ? gulpIcons.error : gulpIcons.warning,
			wait: hasError,
			sound: hasError ? 'Basso' : false
		};

		if (object.warning || object.error && (!object.warnings && !object.errors)) {
			message = 'Some issues found';
		}
		if (object.warnings) {
			warning = pluralize(' warning', object.warnings);
			message = object.warnings + warning + message;
		}
		if (object.errors) {
			let error = pluralize(' error', object.warnings);
			message = object.errors + error + (object.warnings ? ' and ' : '') + message;
		}

		if (config.root.notifications) {
			notifier.notify({
				title: options.title,
				subtitle: object.subtitle,
				message: message,
				icon: options.icon,
				wait: options.wait,
				sound: options.sound
			});
		} else {
			// Output an error message in the console
			let text = ' (' + object.subtitle + '): ' + message;
			if (hasError) {
				util.log(util.colors.red(options.title) + text);
			} else {
				util.log(util.colors.yellow(options.title) + text);
			}
		}
	}
}

function buildPath() {
	const workingDirectory = __dirname,
		folder = workingDirectory.split('/'),
		os = require('os');

	// check if we're working local or on typokeeper
	if (os.hostname().match(/local$/)) {
		const vhostIndex = folder.indexOf('src') + 1;
		// construct the base url from parts of our working directory
		// customer name
		return 'http://' + folder[vhostIndex] + '.flow.dev';
	} else {
		// check if we are in the users directory
		if (workingDirectory.indexOf('vhosts')) {
			// construct the base url from parts of our working directory
			//				   customer name	 username
			return 'http://' + folder[4] + '.' + folder[2] + '.cms.dev.interner-server.de/';
		} else {
			// construct the base url from parts of the working directory
			//				   customer name is this time on the second position, because we are not in a user dir
			return 'http://' + folder[2] + '.dev.interner-server.de/';
		}
	}
}

module.exports = {
	globalImport: globalImport,
	getTimestamp: getTimestamp,
	getExtensions: getExtensions,
	mergeConfigAndLoadTasks: mergeConfigAndLoadTasks,
	getFilesToWatch: getFilesToWatch,
	pluralize: pluralize,
	notifyText: notifyText,
	buildPath: buildPath
};
