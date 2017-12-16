const {promisify} = require('util');
const fs = require('fs-extra');
const program = require('commander');
const path = require('path');
const rawGlob = require('glob');
const pkg = require('./package.json');

(async () => {
	const glob = promisify(rawGlob);

	program
		.version(pkg.version)
		.usage('[options] <directory>')
		.parse(process.argv);

	const [pattern] = program.args;
	const directories = await glob(directory);

	for (const directory of directories) {
		if (!(await fs.pathExists(directory))) {
			console.error(`${directory} not exist`);
			continue;
		}

		if (await fs.pathExists(path.resolve(directory, '.git'))) {
			console.log('git');
		}

		if (await fs.pathExists(path.resolve(directory, '.hg'))) {
			console.log('hg');
		}
	}
})();
