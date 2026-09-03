import type {
	ArrayManifestResult,
	ManifestOperation,
	ManifestResultFor,
	ReconfigureManifestRequest,
	ReconfigureManifestResult,
	SetupManifestRequest,
} from "../../../plugins/ws/skills/ws-project-bootstrap/manifest-contract.d.mts";
import type { ReconfigureOperationReport } from "../../../plugins/ws/skills/ws-project-bootstrap/reconfigure.d.mts";

type Assert<Condition extends true> = Condition;
type Equal<Left, Right> =
	(<Value>() => Value extends Left ? 1 : 2) extends (<Value>() => Value extends Right ? 1 : 2)
		? (<Value>() => Value extends Right ? 1 : 2) extends (<Value>() => Value extends Left ? 1 : 2)
			? true
			: false
		: false;

type SetupResult = ManifestResultFor<SetupManifestRequest>;
type ReconfigureResult = ManifestResultFor<ReconfigureManifestRequest>;

type SetupModeSelectsArrayResult = Assert<Equal<SetupResult, ArrayManifestResult>>;
type SetupOperationsStayArrayShaped = Assert<Equal<SetupResult["operations"], ManifestOperation[]>>;
type ReconfigureModeSelectsReconfigureResult = Assert<Equal<ReconfigureResult, ReconfigureManifestResult>>;
type ReconfigureOperationsUseOperationReport = Assert<Equal<ReconfigureResult["operations"], [] | ReconfigureOperationReport>>;

export type ManifestContractTypeAssertions =
	| SetupModeSelectsArrayResult
	| SetupOperationsStayArrayShaped
	| ReconfigureModeSelectsReconfigureResult
	| ReconfigureOperationsUseOperationReport;
