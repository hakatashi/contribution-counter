const download = require('download');
const fs = require('fs-extra');

let matches = null;
const CONTINUE_FROM = 'rsyslog';

(async () => {
	const packageData = await download('https://gist.github.com/hakatashi/33af4c73384e9c8ea7deef5362b889fd/raw/9b9ecfb49eb53bd7b0ab016800dc0ef92e604936/installed.txt');

	const currentData = await fs.readJson('data.json');
	if (!currentData.specials) {
		currentData.specials = {};
	}

	const urls = new Set();
	let enabled = CONTINUE_FROM === null;
	for (const line of packageData.toString().split('\n')) {
		if (!(matches = line.match(/^(.+?)\/.+? (.+?) .+? .+?$/))) {
			continue;
		}

		const [_, name, version] = matches;

		if (name === CONTINUE_FROM) {
			enabled = true;
		}

		if (!enabled) {
			continue;
		}

		if (currentData.specials[`deb/changelog/${name}`]) {
			continue;
		}

		const html = await download(`https://packages.debian.org/en/jessie/${name}`);

		if (!(matches = html.toString().match(/<a href="(.+?_changelog)">/))) {
			console.error(`${name}: not found`);
			continue;
		}

		const changelogUrl = matches[1];

		const changelog = await download(changelogUrl);
		currentData.specials[`deb/changelog/${name}`] = {};

		for (const changelogLine of changelog.toString().split('\n')) {
			if (matches = changelogLine.match(/^ -- ([^<>]+) <([^<> ]+?)>/)) {
				const [__, userName, email] = matches;
				const label = `${userName} <${email}>`;
				currentData.specials[`deb/changelog/${name}`][label] = {name: userName, email};
			}
		}

		console.log(`${name}: found ${Object.keys(currentData.specials[`deb/changelog/${name}`]).length} contributors`);

		console.log('Writing data.json');

		await fs.writeJson('data.json', currentData);
	}
})();
