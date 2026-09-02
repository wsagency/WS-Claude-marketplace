export const RECONFIGURE_NOW_FIXTURE = 1_693_612_800_000;

export function createMockReconfigureAdapters(overrides = {}) {
	let journal = null;
	let audit = null;
	const applied = [];
	const verified = [];
	const history = [];
	const applyEffect = overrides.applyEffect || (async effect => ({ identity: { id: `result:${effect.id}`, version: 1 } }));
	const verifyEffect = overrides.verifyEffect || (async () => true);

	return {
		writeJournal: async (hash, state) => {
			journal = { hash, state: structuredClone(state) };
			history.push(`journal:${state.phase}:${state.status}`);
		},
		readJournal: async () => journal,
		removeJournal: async () => {
			journal = null;
			history.push("removeJournal");
		},
		appendAudit: async record => {
			audit = structuredClone(record);
			history.push("appendAudit");
		},
		revalidateLocalFingerprints: async () => true,
		revalidateMachineFingerprints: async () => true,
		refetchRemoteFingerprint: async effect => Object.hasOwn(effect, "remoteFingerprint") ? effect.remoteFingerprint : effect.fingerprint ?? null,
		verifyCutover: async () => true,
		verifyCompletion: async () => true,
		validatePartialState: async () => ({ valid: true }),
		now: () => RECONFIGURE_NOW_FIXTURE,
		...overrides,
		applyEffect: async (...args) => {
			const [effect] = args;
			applied.push(effect.id);
			history.push(`apply:${effect.id}`);
			return applyEffect(...args);
		},
		verifyEffect: async (...args) => {
			const [effect] = args;
			verified.push(effect.id);
			history.push(`verify:${effect.id}`);
			return verifyEffect(...args);
		},
		getJournal: () => journal,
		getAudit: () => audit,
		getApplied: () => applied,
		getVerified: () => verified,
		getHistory: () => history,
	};
}
