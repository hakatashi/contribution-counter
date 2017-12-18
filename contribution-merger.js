const fs = require('fs-extra');

(async () => {
	const data = await fs.readJson('data.json');

	const repos = [
		data.repos['/home/admin/kernel/linux'],
		data.repos['/home/admin/kernel/history'],
		data.specials['linux/CREDITS'],
		data.specials['linux/MAINTAINERS'],
	];

	const repoNames = [
		'/home/admin/kernel/linux',
		'/home/admin/kernel/history',
		'linux/CREDITS',
		'linux/MAINTAINERS',
	];

	/*
	const repos = [
		...Object.values(data.repos),
		...Object.values(data.specials),
	];

	const repoNames = [
		...Object.keys(data.repos),
		...Object.keys(data.specials),
	];
	*/

	const labels = new Set([].concat(...repos.map((repo) => Object.keys(repo))));
	const labelMapper = new Map([].concat(...repos.map((repo) => Object.entries(repo))));
	const grouper = new Map(Array.from(labels).map((label, index) => [label, index]));
	const reverseGrouper = new Map(Array.from(labels).map((label) => [grouper.get(label), [label]]));

	let maxId = labels.size;

	// glue entries with the same email
	const emailMapper = new Map();
	for (const label of labels) {
		const {email} = labelMapper.get(label);
		if (!emailMapper.has(email)) {
			emailMapper.set(email, []);
		}
		emailMapper.get(email).push(label);
	}
	for (const [email, emailLabels] of emailMapper.entries()) {
		if (emailLabels.length > 1 && email !== null && email !== '') {
			reverseGrouper.set(maxId, emailLabels);
			for (const label of emailLabels) {
				grouper.set(label, maxId);
			}
			maxId++;
		}
	}

	// glue entries with the same name from the same repo
	for (const repo of repos) {
		const nameMapper = new Map();
		for (const [label, {name}] of Object.entries(repo)) {
			if (!nameMapper.has(name)) {
				nameMapper.set(name, []);
			}
			nameMapper.get(name).push(label);
		}
		for (const [name, nameLabels] of nameMapper.entries()) {
			if (nameLabels.length > 1 && name !== null && name !== '') {
				const glueingGroups = Array.from(new Set(nameLabels.map((label) => grouper.get(label))));
				const glueingLabels = Array.from(new Set([].concat(...glueingGroups.map((group) => reverseGrouper.get(group)))));

				reverseGrouper.set(maxId, glueingLabels);
				for (const label of glueingLabels) {
					grouper.set(label, maxId);
				}
				maxId++;
			}
		}
	}

	const counter = new Map();

	// count contributions by groups
	for (const [index, repo] of repos.entries()) {
		const repoName = repoNames[index];
		for (const [label, {contributeCount, authorCount}] of Object.entries(repo)) {
			const group = grouper.get(label);

			if (!counter.has(group)) {
				counter.set(group, {
					labels: reverseGrouper.get(group),
					contributeCount: 0,
					authorCount: 0,
					repos: new Set(),
				});
			}

			const currentRecord = counter.get(group);

			currentRecord.contributeCount += contributeCount || 0;
			currentRecord.authorCount += authorCount || 0;
			currentRecord.repos.add(repoName);
		}
	}

	console.log(Array.from(counter.values()).sort((a, b) => (b.contributeCount + b.authorCount) - (a.contributeCount + a.authorCount)));
})();
