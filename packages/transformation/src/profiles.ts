import type { ProjectAssessment, VerificationAuthorization } from '@ae/contracts';
import { matchesTrustedFixtureAssessment, runFixtureDelivery, checkFixtureDeliveryEvidence, assertTrustedFixtureDelivery } from './fixture-harness.js';
import { captureFixtureBaseline, assertFixtureBaseline } from './fixture-baseline.js';
import { matchesInventoryAssessment, captureInventoryBaseline, assertInventoryBaseline, assertTrustedInventoryDelivery } from './inventory-baseline.js';
import { runInventoryDelivery, checkInventoryDeliveryEvidence } from './inventory-harness.js';
import { matchesJavaAssessment, captureJavaBaseline, assertJavaBaseline, assertTrustedJavaDelivery } from './java-baseline.js';
import { runJavaDelivery, checkJavaDeliveryEvidence, javaGates } from './java-harness.js';

import { matchesRevealAssessment, captureRevealBaseline, assertRevealBaseline, assertTrustedRevealDelivery } from './reveal-baseline.js';
import { runRevealDelivery, checkRevealDeliveryEvidence, revealGates } from './reveal-harness.js';
import { matchesLinkdingAssessment, captureLinkdingBaseline, assertLinkdingBaseline, assertTrustedLinkdingDelivery } from './linkding-baseline.js';
import { matchesKanboardAssessment, captureKanboardBaseline, assertKanboardBaseline, assertTrustedKanboardDelivery } from './kanboard-baseline.js';
import { runLinkdingDelivery, checkLinkdingDeliveryEvidence, linkdingGates } from './linkding-harness.js';
import { runKanboardDelivery, checkKanboardDeliveryEvidence, kanboardGates } from './kanboard-harness.js';

export type VerificationProfile = VerificationAuthorization['profile'];
const shared = { isolation: 'exact-fixture-temporary-worktree', network: 'loopback-only-no-external', maximumCostUsd: 0, maximumElapsedMs: 300000, maximumHeapMiB: 640 } as const;
const upstreamPins = {
  'reveal-upstream-v1': '75dff6f515d2d08df0c32cf2b7328b89425c6f25',
  'linkding-upstream-v1': '24b5ad6cc9bde497b5d1b1e86aed5a2fb7d25c2f',
  'kanboard-upstream-v1': 'e197e71af4ff9f371b931ab0338b2b41827e6394',
} as const;
export function verificationAuthorization(profile: VerificationProfile): VerificationAuthorization {
  const browser = ['baseline-differential', 'host-build', 'runtime-http', 'browser'] as const;
  if (profile === 'reveal-upstream-v1') return { ...shared, version: '1', profile, sourceCommit: upstreamPins[profile], isolation: 'exact-pinned-upstream-temporary-worktree', actions: [...browser] };
  if (profile === 'linkding-upstream-v1') return { ...shared, version: '1', profile, sourceCommit: upstreamPins[profile], isolation: 'exact-pinned-upstream-temporary-worktree', actions: [...browser] };
  if (profile === 'kanboard-upstream-v1') return { ...shared, version: '1', profile, sourceCommit: upstreamPins[profile], isolation: 'exact-pinned-upstream-temporary-worktree', actions: [...browser] };
  if (profile === 'react-helpdesk-synthetic-v1') return { ...shared, version: '1', profile, actions: [...browser] };
  if (profile === 'python-inventory-synthetic-v1' || profile === 'java-spring-inventory-synthetic-v1') return { ...shared, version: '1', profile, actions: ['baseline-differential', 'host-build', 'runtime-rpc', 'cli'] };
  throw Error('Unknown reviewed verification profile');
}
/** Preserve the three original approval byte bindings; add only the pinned-source scope. */
export function verificationExcludedActions(profile?: VerificationProfile): string[] {
  if (profile) verificationAuthorization(profile); // Reject unknown runtime values instead of widening a default.
  const source = !profile ? 'source execution' : Object.hasOwn(upstreamPins, profile) ? 'source execution outside the exact pinned upstream verification profile' : 'customer source execution outside the exact synthetic fixture profile';
  return ['deployment', 'publishing', 'dependency installation', source, 'paid model calls'];
}
export function matchesProfileAssessment(profile: VerificationProfile, assessment: ProjectAssessment): boolean {
  if (profile === 'react-helpdesk-synthetic-v1') return matchesTrustedFixtureAssessment(assessment);
  if (profile === 'java-spring-inventory-synthetic-v1') return matchesJavaAssessment(assessment);
  if (profile === 'python-inventory-synthetic-v1') return matchesInventoryAssessment(assessment);
  if (profile === 'reveal-upstream-v1') return assessment.baseCommit === upstreamPins[profile] && matchesRevealAssessment(assessment);
  if (profile === 'linkding-upstream-v1') return assessment.baseCommit === upstreamPins[profile] && matchesLinkdingAssessment(assessment);
  if (profile === 'kanboard-upstream-v1') return assessment.baseCommit === upstreamPins[profile] && matchesKanboardAssessment(assessment);
  return false;
}
const commonFiles = { report: 'report.json', baseline: 'baseline.json', differential: 'differential.json', originalBuild: 'original-build.json', candidateBuild: 'candidate-build.json', runtime: 'runtime.json' };
const commonGates = ['host-typecheck', 'host-business-tests', 'black-box-business-differential', 'authenticated-runtime'];
export function reviewedProfile(profile: VerificationProfile) {
  if (profile === 'react-helpdesk-synthetic-v1') return {
    profile, collectorId: 'trusted-helpdesk-delivery-v1' as const, collectorFile: './fixture-baseline.js',
    capture: captureFixtureBaseline, assertBaseline: assertFixtureBaseline, assertTrusted: assertTrustedFixtureDelivery,
    run: runFixtureDelivery, check: checkFixtureDeliveryEvidence, evidenceFiles: { ...commonFiles, browser: 'browser.json' },
    gates: [...commonGates, 'browser-acceptance', 'fixture-process-completion'],
    environment: 'Fixed react-helpdesk-synthetic-v1 isolated fixture harness; no customer code execution',
  };
  if (profile === 'java-spring-inventory-synthetic-v1') return {
    profile, collectorId: 'trusted-java-spring-delivery-v1' as const, collectorFile: './java-baseline.js',
    capture: captureJavaBaseline, assertBaseline: assertJavaBaseline, assertTrusted: assertTrustedJavaDelivery,
    run: runJavaDelivery, check: checkJavaDeliveryEvidence, evidenceFiles: { ...commonFiles, browser: 'cli.json' },
    gates: javaGates, environment: 'Fixed Java 21/Spring Core 6.2.19 synthetic CLI/HTTP fixture; not Spring Boot/MVC or arbitrary Java source execution',
  };
  if (profile === 'python-inventory-synthetic-v1') return {
    profile, collectorId: 'trusted-inventory-delivery-v1' as const, collectorFile: './inventory-baseline.js',
    capture: captureInventoryBaseline, assertBaseline: assertInventoryBaseline, assertTrusted: assertTrustedInventoryDelivery,
    run: runInventoryDelivery, check: checkInventoryDeliveryEvidence, evidenceFiles: { ...commonFiles, browser: 'cli.json' },
    gates: ['host-compilation', ...commonGates.slice(1), 'cli-acceptance', 'fixture-process-completion'],
    environment: 'Fixed python-inventory-synthetic-v1 isolated fixture harness; no arbitrary customer code execution',
  };
  if (profile === 'reveal-upstream-v1') return {
    profile, collectorId: 'trusted-reveal-delivery-v1' as const, collectorFile: './reveal-baseline.js',
    capture: captureRevealBaseline, assertBaseline: assertRevealBaseline, assertTrusted: assertTrustedRevealDelivery,
    run: runRevealDelivery, check: checkRevealDeliveryEvidence, evidenceFiles: { ...commonFiles, browser: 'browser.json' },
    gates: revealGates, environment: 'Exact pinned reveal upstream local profile; owned seeded data and loopback only; not arbitrary source execution or production readiness',
  };
  if (profile === 'linkding-upstream-v1') return {
    profile, collectorId: 'trusted-linkding-delivery-v1' as const, collectorFile: './linkding-baseline.js',
    capture: captureLinkdingBaseline, assertBaseline: assertLinkdingBaseline, assertTrusted: assertTrustedLinkdingDelivery,
    run: runLinkdingDelivery, check: checkLinkdingDeliveryEvidence, evidenceFiles: { ...commonFiles, browser: 'browser.json' },
    gates: linkdingGates, environment: 'Exact pinned linkding upstream local profile; owned seeded data and loopback only; not arbitrary source execution or production readiness',
  };
  if (profile === 'kanboard-upstream-v1') return {
    profile, collectorId: 'trusted-kanboard-delivery-v1' as const, collectorFile: './kanboard-baseline.js',
    capture: captureKanboardBaseline, assertBaseline: assertKanboardBaseline, assertTrusted: assertTrustedKanboardDelivery,
    run: runKanboardDelivery, check: checkKanboardDeliveryEvidence, evidenceFiles: { ...commonFiles, browser: 'browser.json' },
    gates: kanboardGates, environment: 'Exact pinned kanboard upstream local profile; owned seeded data and loopback only; not arbitrary source execution or production readiness',
  };
  throw Error('Unknown reviewed verification profile');
}

/** The delivery chain must retain the same profile-specific exclusions as approval. */
export function assertVerificationExclusions(exclusions: string[], profile?: VerificationProfile): void {
  if (JSON.stringify(exclusions) !== JSON.stringify(verificationExcludedActions(profile))) throw Error('Approval exclusions mismatch');
}
