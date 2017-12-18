const fs = require('fs-extra');
const download = require('download');

process.on('unhandledRejection', (error) => {
	throw error;
});

(async () => {
	const maintainers = await download('https://github.com/torvalds/linux/raw/v3.10/MAINTAINERS');
	const dataJson = 'data.json';

	const records = {};

	for (const [index, line] of maintainers.toString().split('\n').entries()) {
		if (index < 118) {
			continue;
		}

		let matches, matches2;
		if (matches = line.match(/^M:\s+(.+)$/)) {
			const maintainer = matches[1].trim();

			if (matches2 = maintainer.match(/^([^<>]+?)(?:\s*<([^<>]+?)>)?$/)) {
				const name = (matches2[1] || '').trim();
				const email = (matches2[2] || '').trim();

				if (!records[`${name} <${email}>`]) {
					records[`${name} <${email}>`] = {name, email};
				}
			}
		}
	}

	const currentData = await fs.readJson(dataJson);
	if (!currentData.specials) {
		currentData.specials = {};
	}
	currentData.specials['linux/MAINTAINERS'] = records;
	await fs.writeJson(dataJson, currentData);
})();
