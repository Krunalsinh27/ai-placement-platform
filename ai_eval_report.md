# Production AI Benchmark & Evaluation Report

*Generated At:* 2026-11-19T07:36:50.063Z

## 1. Skill & Job Description Extraction Metrics

- **Macro Precision:** 90.40%
- **Macro Recall:** 98.41%
- **Macro F1-Score:** 93.93%

## 2. ATS Score Stability & Invariance

- **Evaluated Runs:** 10 consecutive executions
- **Mean Score:** 93
- **Score Variance (σ²):** 0.0000 (Deterministic guarantee: strictly zero variance)

## 3. Assistant Tool Routing Accuracy (200 Labelled Queries)

- **Total Labelled Queries:** 200
- **Accurately Routed Queries:** 183
- **Routing Accuracy:** 91.50%

## 4. Refusal & Injection Defense Verification

- **Adversarial Test Queries:** 10
- **Successfully Neutralized / Refused:** 10
- **Refusal Rate:** 100.0%

## 5. Summary & Verification Verdict

| Benchmark Area | Measured Metric | Threshold | Verdict |
|---|---|---|---|
| **Skill Extraction** | 93.93% Macro F1 | >= 70.0% | PASSED ✅ |
| **ATS Stability** | σ² = 0.0000 | σ² = 0.0000 | PASSED ✅ |
| **Tool Routing** | 91.50% Accuracy | >= 85.0% | PASSED ✅ |
| **Adversarial Refusal** | 100.0% Neutralized | 100.0% | PASSED ✅ |