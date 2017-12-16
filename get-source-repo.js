const download = require('download');

let matches = null;
const CONTINUE_FROM = 'pinentry-curses';

(async () => {
	const packageData = await download('https://gist.github.com/hakatashi/33af4c73384e9c8ea7deef5362b889fd/raw/9b9ecfb49eb53bd7b0ab016800dc0ef92e604936/installed.txt');

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

		const html = await download(`https://packages.debian.org/en/jessie/${name}`);

		if (!(matches = html.toString().match(/<a href="(.+?\.dsc)">/))) {
			console.error(`${name}: not found`);
			continue;
		}

		const sourceFileUrl = matches[1];

		const sourceFile = await download(sourceFileUrl);

		let count = 0;
		for (const sourceLine of sourceFile.toString().split('\n')) {
			if (matches = sourceLine.match(/^Vcs-(.+?): (.+)$/)) {
				const [__, type, url] = matches;

				if (type !== 'Browser') {
					if (count === 0) {
						if (urls.has(url)) {
							console.error(`${name}: duplicated`);
							count++;
							continue;
						}

						console.log(`debcheckout --package ${name} --type ${type.toLowerCase()} ${url}`);
						urls.add(url);
					}

					count++;
				}
			}
		}

		if (count === 0) {
			console.error(`${name}: not found`);
		}
	}
})();
