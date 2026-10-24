import { compareBaseline, verifyArchive, toVerificationCheck, type PublicBehaviorAdapter } from '@ae/verification';
import type { AdaptationPlan, DifferentialReport, BehaviorConfiguration, BaselineArchive, Improvement, ProjectAssessment, Provenance, VerificationReport } from '@ae/contracts';
import { adaptationCodeHash, digest, expectedBaselineCodeHash, verifyAdaptation, type AppliedTransformation } from './index.js';

/** Opt-in reviewed harness execution, not part of the static source verifier or the runtime API. */
export async function verifyAdaptationWithBehavior(applied: AppliedTransformation, input: {
  assessment: ProjectAssessment; plan: AdaptationPlan; baseline: BaselineArchive;
  adapter: PublicBehaviorAdapter; provenance: Provenance; configuration: BehaviorConfiguration; improvements: Improvement[];
}): Promise<{ verification: VerificationReport; differential: DifferentialReport }> {
  const baseline = verifyArchive(input.baseline);
  if (digest(input.plan) !== applied.patch.planHash || digest(input.assessment) !== input.plan.assessmentHash || input.plan.baseCommit !== applied.patch.baseCommit) throw new Error('Behavior evidence does not bind this transformation');
  if (baseline.manifest.provenance.sourceVersion !== applied.patch.baseCommit || baseline.manifest.provenance.codeHash !== expectedBaselineCodeHash(input.assessment, input.plan)) throw new Error('Baseline is not bound to the assessed source');
  const actualCodeHash = adaptationCodeHash(applied.patch.worktree, input.assessment, input.plan);
  if (input.provenance.sourceVersion !== applied.patch.baseCommit || input.provenance.codeHash !== actualCodeHash || input.configuration.candidateCodeHash !== actualCodeHash) throw new Error('Candidate behavior evidence source drift');
  const report = verifyAdaptation(applied);
  if (report.checks.some(check => check.status === 'fail')) throw new Error('Static patch drift blocks behavior execution');
  // The developer host must review the adapter's isolation and connection to this worktree.
  // Hash binding does not prove an arbitrary adapter honestly executes the candidate.
  const differential = await compareBaseline({ baseline, adapter: input.adapter, provenance: input.provenance, configuration: input.configuration, improvements: input.improvements });
  report.checks = report.checks.filter(check => check.name !== 'black-box-business-differential');
  report.checks.push(toVerificationCheck(differential));
  return { verification: report, differential };
}
