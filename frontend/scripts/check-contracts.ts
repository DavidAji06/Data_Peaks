/**
 * Type-checks the backend samples in contracts/*.json (repo root) against lib/contracts.ts and the adapters.
 *
 * Run: npm run check:contracts
 * It uses tsconfig.contracts.json and is excluded from the main tsconfig on purpose: a change in the
 * backend samples should show up here, not break `next build` right before a demo.
 */
import alert from '../../contracts/alert.json';
import groupView from '../../contracts/group_view.json';
import question from '../../contracts/question.json';
import rankedRisk from '../../contracts/ranked_risk.json';
import response from '../../contracts/response.json';
import risk from '../../contracts/risk.json';
import similarRisk from '../../contracts/similar_risk.json';
import trigger from '../../contracts/trigger.json';
import {
  alertFromWire,
  groupViewFromWire,
  questionFromWire,
  rankedRiskFromWire,
  responseFromWire,
  riskFromWire,
  similarRiskFromWire,
  triggerFromWire,
} from '../lib/adapters';
import type {
  WireAlert,
  WireGroupView,
  WireQuestion,
  WireRankedRisk,
  WireResponse,
  WireRisk,
  WireSimilarRisk,
  WireTrigger,
} from '../lib/contracts';

// 1. Every sample matches its wire interface.
const samples: {
  alert: WireAlert;
  groupView: WireGroupView;
  question: WireQuestion;
  rankedRisk: WireRankedRisk;
  response: WireResponse;
  risk: WireRisk;
  similarRisk: WireSimilarRisk;
  trigger: WireTrigger;
} = { alert, groupView, question, rankedRisk, response, risk, similarRisk, trigger };

// 2. Every adapter accepts its sample.
const domainRisk = riskFromWire(samples.risk);
export const converted = {
  risk: domainRisk,
  trigger: triggerFromWire(samples.trigger),
  alert: alertFromWire(samples.alert),
  question: questionFromWire(samples.question, {
    context: { triggerUpdate: '', evidence: [] },
    similarRisks: [similarRiskFromWire(samples.similarRisk)],
    acapsProbability: domainRisk.probability,
  }),
  response: responseFromWire(samples.response),
  groupView: groupViewFromWire(samples.groupView, domainRisk.probability),
  rankedRisk: rankedRiskFromWire(samples.rankedRisk, domainRisk),
};
