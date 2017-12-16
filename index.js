const {promisify} = require('util');
const fs = require('fs-extra');
const program = require('commander');
const path = require('path');
const rawGlob = require('glob');
const Git = require('nodegit');
const {HGRepo} = require('hg');
const pkg = require('./package.json');

class MapMap {
	constructor() {
		this.map = new Map();
	}

	set(key1, key2, value) {
		if (!this.map.has(key1)) {
			this.map.set(key1, new Map());
		}

		this.map.get(key1).set(key2, value);
	}

	get(key1, key2) {
		if (!this.map.has(key1)) {
			return undefined;
		}

		return this.map.get(key1).get(key2);
	}

	has(key1, key2) {
		if (!this.map.has(key1)) {
			return false;
		}

		return this.map.get(key1).has(key2);
	}
}

(async () => {
	const glob = promisify(rawGlob);
	const cwd = process.cwd();

	program
		.version(pkg.version)
		.usage('[options] <directory>')
		.option('-d, --data', 'Data JSON file which read/written to', 'data.json')
		.parse(process.argv);

	const [pattern] = program.args;
	const directories = await glob(pattern);

	let currentData = new Map();
	if (await fs.pathExists(program.data)) {
		const rawData = await fs.readJson(program.data);
		currentData = new Map(Object.entries(rawData));
		await fs.move(program.data, `${program.data}.bak`, {overwrite: true});
	}

	for (const directory of directories) {
		if (!(await fs.pathExists(directory))) {
			console.error(`${directory} not exist`);
			continue;
		}

		const maps = {
			set: new Set(),
			authorCount: new Map(),
			contributeCount: new Map(),
			name: new Map(),
			email: new Map(),
		};

		const repoPath = path.resolve(cwd, directory);

		if (await fs.pathExists(path.resolve(directory, '.git'))) {
			console.log(`Detected git repository on ${directory}`);

			const gitPath = path.resolve(directory, '.git');
			const repo = await Git.Repository.open(gitPath);
			const masterCommit = await repo.getMasterCommit();
			const history = masterCommit.history();

			history.start();

			history.on('commit', (commit) => {
				const author = commit.author();
				const name = author.name();
				const email = author.email().replace(/[<>]/g, '');

				const authorText = `${name} <${email}>`;

				if (!maps.set.has(authorText)) {
					maps.set.add(authorText);
					maps.authorCount.set(authorText, 0);
					maps.contributeCount.set(authorText, 0);
					maps.name.set(authorText, name);
					maps.email.set(authorText, email);
				}

				maps.authorCount.set(authorText, maps.authorCount.get(authorText) + 1);
			});

			await new Promise((resolve) => {
				history.on('end', resolve);
			});

			const result = {};
			for (const author of maps.set) {
				result[author] = {
					authorCount: maps.authorCount.get(author),
					contributeCount: maps.contributeCount.get(author),
					name: maps.name.get(author),
					email: maps.email.get(author),
				}
			}

			continue;
		}

		if (await fs.pathExists(path.resolve(directory, '.hg'))) {
			console.log(`Detected mercurial repository on ${directory}`);

			const repo = new HGRepo(directory);

			const log = await new Promise((resolve, reject) => {
				repo.log('-Tjson', (error, log) => {
					if (error) {
						reject(error);
					} else {
						resolve(log);
					}
				});
			});

			const json = log.filter((line) => typeof line.body === 'string').map((line) => line.body).join('');
			console.log(JSON.parse(json));

			continue;
		}
	}
})();
