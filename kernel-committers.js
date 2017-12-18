const fs = require('fs-extra');
const download = require('download');

process.on('unhandledRejection', (error) => {
	throw error;
});

(async () => {
	const credits = await download('https://github.com/torvalds/linux/raw/v3.10/CREDITS');
	const dataJson = 'data.json';

	let currentRecord = {};
	const records = {};

	for (const [index, line] of credits.toString().split('\n').entries()) {
		if (index < 11) {
			continue;
		}

		if (line.length === 0) {
			for (const name of (currentRecord.N || [])) {
				for (const email of (currentRecord.E || [])) {
					records[`${name.replace(/<>/g, '')} <${email.replace(/<>/g, '')}>`] = {
						name: name.replace(/<>/g, ''),
						email: email.replace(/<>/g, ''),
					};
				}
			}
			currentRecord = {};
			continue;
		}

		if (line.includes(': ')) {
			const [_, key, value] = line.match(/^(.+?): (.+)$/);
			if (!currentRecord[key.trim()]) {
				currentRecord[key.trim()] = [];
			}

			currentRecord[key.trim()].push(value.trim());
		}
	}

	if (Object.keys(currentRecord) > 0) {
		for (const name of (currentRecord.N || [])) {
			for (const email of (currentRecord.E || [])) {
				records[`${name.replace(/<>/g, '')} <${email.replace(/<>/g, '')}>`] = {
					name: name.replace(/<>/g, ''),
					email: email.replace(/<>/g, ''),
				};
			}
		}
	}

	const currentData = await fs.readJson(dataJson);
	if (!currentData.specials) {
		currentData.specials = {};
	}
	currentData.specials['linux/CREDITS'] = records;
	await fs.writeJson(dataJson, currentData);
})();
