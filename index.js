const {promisify} = require('util');
const {spawn} = require('child_process');
const fs = require('fs-extra');
const program = require('commander');
const path = require('path');
const rawGlob = require('glob');
const Git = require('nodegit');
const {HGRepo} = require('hg');
const svn = require('node-svn-ultimate');
const concat = require('concat-stream');
const pkg = require('./package.json');

process.on('unhandledRejection', (error) => {
	throw error;
});

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
		.usage('[options] <patterns>')
		.option('-d, --data', 'Data JSON file which read/written to', 'data.json')
		.parse(process.argv);

	program.data = program.data || 'data.json';

	const patterns = program.args;
	const directoryMatches = await Promise.all(patterns.map((pattern) => glob(pattern)));

	const directories = [].concat(...directoryMatches);

	let currentData = {
		repos: {},
		dates: {},
	};

	if (await fs.pathExists(program.data)) {
		currentData = await fs.readJson(program.data);
		await fs.move(program.data, `${program.data}.bak`, {overwrite: true});
	}

	const dateStats = new Map(Object.entries(currentData.dates));

	for (const directory of directories) {
		if (!(await fs.pathExists(directory))) {
			console.error(`${directory} not exist`);
			continue;
		}

		const repoPath = path.resolve(cwd, directory);

		if (currentData.repos[repoPath] !== undefined) {
			console.log(`${directory} is already stated`);
			continue;
		}

		const maps = {
			set: new Set(),
			authorCount: new Map(),
			contributeCount: new Map(),
			name: new Map(),
			email: new Map(),
		};

		const processCommit = ({name, email, message, date}) => {
			name = name.replace(/[<>]/g, '');
			email = email.replace(/[<>]/g, '');

			const authorText = `${name} <${email}>`;

			if (!maps.set.has(authorText)) {
				maps.set.add(authorText);
				maps.authorCount.set(authorText, 0);
				maps.contributeCount.set(authorText, 0);
				maps.name.set(authorText, name);
				maps.email.set(authorText, email);
			}

			maps.authorCount.set(authorText, maps.authorCount.get(authorText) + 1);

			const day = date.toISOString().slice(0, 10);
			if (!dateStats.has(day)) {
				dateStats.set(day, 0);
			}

			dateStats.set(day, dateStats.get(day) + 1);

			const contributors = [];
			let matches;

			const authorRegexp = /^\s*(?:Signed-off-by|Author):\s*([^<>]+?)(?:\s*<([^<>]+?)>)?\s*$/gm;
			while (matches = authorRegexp.exec(message)) {
				contributors.push({
					name: (matches[1] || '').trim(),
					email: (matches[2] || '').trim(),
				});
			}

			const solutionRegexp = /^\s*Solution:.+?\((.+?)\)\s*$/gm;
			while (matches = solutionRegexp.exec(message)) {
				contributors.push({
					name: matches[1].trim(),
					email: '',
				});
			}

			for (const contributor of contributors) {
				const contributorText = `${contributor.name} <${contributor.email}>`;

				if (!maps.set.has(contributorText)) {
					maps.set.add(contributorText);
					maps.authorCount.set(contributorText, 0);
					maps.contributeCount.set(contributorText, 0);
					maps.name.set(contributorText, contributor.name);
					maps.email.set(contributorText, contributor.email);
				}

				maps.contributeCount.set(contributorText, maps.contributeCount.get(contributorText) + 1);
			}
		};

		if (await fs.pathExists(path.resolve(directory, '.git'))) {
			console.log(`Detected git repository on ${directory}`);

			const gitPath = path.resolve(directory, '.git');
			const repo = await Git.Repository.open(gitPath);
			const masterCommit = await repo.getHeadCommit();
			const history = masterCommit.history();

			history.start();

			history.on('commit', (commit) => {
				const author = commit.author();
				const name = author.name();
				const email = author.email();
				const message = commit.message();
				const date = commit.date();
				processCommit({name, email, message, date});
			});

			await new Promise((resolve) => {
				history.on('end', resolve);
			});
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
			const commits = JSON.parse(json);

			for (const commit of commits) {
				const match = commit.user.match(/^\s*(.+?)\s*<(.+?)>\s*$/);
				if (!match) {
					continue;
				}

				const [_, name, email] = match;
				processCommit({name, email, message: commit.desc, date: new Date(commit.date[0] * 1000)});
			}
		}

		if (await fs.pathExists(path.resolve(directory, '.svn'))) {
			console.log(`Detected svn repository on ${directory}`);

			const {logentry} = await new Promise((resolve, reject) => {
				svn.commands.log(directory, (error, log) => {
					if (error) {
						reject(error);
					} else {
						resolve(log);
					}
				});
			});

			for (const commit of logentry) {
				processCommit({name: commit.author, email: '', message: commit.msg, date: new Date(commit.date)});
			}
		}

		if (await fs.pathExists(path.resolve(directory, '.bzr'))) {
			console.log(`Detected bazaar repository on ${directory}`);

			const bzr = spawn('bzr', ['log', '-n0', '--long'], {
				cwd: repoPath,
			});

			const rawLog = await new Promise((resolve, reject) => {
				const concatter = concat(resolve);
				bzr.stdout.on('error', reject);
				bzr.stdout.pipe(concatter);
			});

			let currentEntry = null;
			let currentCommit = {};
			const commits = [];
			for (const line of rawLog.toString().split('\n')) {
				if (line.includes('----------------')) {
					commits.push(currentCommit);
					currentEntry = null;
					currentCommit = {};
					continue;
				}

				if (line.startsWith('message:')) {
					currentEntry = 'message';
					currentCommit.message = '';
					continue;
				}

				if (currentEntry === 'message') {
					currentCommit.message += `${line}\n`;
					continue;
				}

				if (line.includes(': ')) {
					const matches = line.match(/^(.+?): (.+)$/);
					if (!matches) {
						continue;
					}
					currentEntry = matches[1].trim();
					currentCommit[currentEntry] = matches[2].trim();
					continue;
				}
			}

			if (currentCommit.committer) {
				commits.push(currentCommit);
			}

			for (const commit of commits) {
				let name, email;
				if (commit.committer) {
					const matches = commit.committer.match(/^([^<>]+?)(?:\s*<([^<>]+?)>)?$/);
					if (matches) {
						name = matches[1];
						email = matches[2];
					}
				}

				processCommit({
					name: name || '',
					email: email || '',
					message: commit.message || '',
					date: commit.timestamp ? new Date(commit.timestamp) : new Date(),
				});
			}
		}

		const result = {};
		for (const author of maps.set) {
			result[author] = {
				authorCount: maps.authorCount.get(author),
				contributeCount: maps.contributeCount.get(author),
				name: maps.name.get(author),
				email: maps.email.get(author),
			};
		}

		currentData.repos[repoPath] = result;

		currentData.dates = {};
		for (const [date, count] of dateStats.entries()) {
			currentData.dates[date] = count;
		}

		console.log(`Writing data to ${program.data}`);
		await fs.writeJson(program.data, currentData);
	}

	console.log(`Writing data to ${program.data}`);
	await fs.writeJson(program.data, currentData);
})();
