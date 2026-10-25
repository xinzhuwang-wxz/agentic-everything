import type { ProjectAssessment, VerificationAuthorization } from '@ae/contracts';
import { matchesTrustedFixtureAssessment, runFixtureDelivery, checkFixtureDeliveryEvidence, assertTrustedFixtureDelivery } from './fixture-harness.js';
import { captureFixtureBaseline, assertFixtureBaseline } from './fixture-baseline.js';
import { matchesInventoryAssessment, captureInventoryBaseline, assertInventoryBaseline, assertTrustedInventoryDelivery } from './inventory-baseline.js';
import { runInventoryDelivery, checkInventoryDeliveryEvidence } from './inventory-harness.js';
import { matchesJavaAssessment, captureJavaBaseline, assertJavaBaseline, assertTrustedJavaDelivery } from './java-baseline.js';
import { runJavaDelivery, checkJavaDeliveryEvidence, javaGates } from './java-harness.js';

export type VerificationProfile = VerificationAuthorization['profile'];
const shared = { isolation: 'exact-fixture-temporary-worktree', network: 'loopback-only-no-external', maximumCostUsd: 0, maximumElapsedMs: 300000, maximumHeapMiB: 640 } as const;
export function verificationAuthorization(profile: VerificationProfile): VerificationAuthorization {
  return profile === 'react-helpdesk-synthetic-v1' ? { ...shared, version: '1', profile, actions: ['baseline-differential', 'host-build', 'runtime-http', 'browser'] } : { ...shared, version: '1', profile, actions: ['baseline-differential', 'host-build', 'runtime-rpc', 'cli'] };
}
export function matchesProfileAssessment(profile: VerificationProfile, assessment: ProjectAssessment): boolean {
  return profile === 'react-helpdesk-synthetic-v1' ? matchesTrustedFixtureAssessment(assessment) : profile === 'java-spring-inventory-synthetic-v1' ? matchesJavaAssessment(assessment) : matchesInventoryAssessment(assessment);
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
  return {
    profile, collectorId: 'trusted-inventory-delivery-v1' as const, collectorFile: './inventory-baseline.js',
    capture: captureInventoryBaseline, assertBaseline: assertInventoryBaseline, assertTrusted: assertTrustedInventoryDelivery,
    run: runInventoryDelivery, check: checkInventoryDeliveryEvidence, evidenceFiles: { ...commonFiles, browser: 'cli.json' },
    gates: ['host-compilation', ...commonGates.slice(1), 'cli-acceptance', 'fixture-process-completion'],
    environment: 'Fixed python-inventory-synthetic-v1 isolated fixture harness; no arbitrary customer code execution',
  };
}
