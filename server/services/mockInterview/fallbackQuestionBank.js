/**
 * Deterministic Question Bank for AI Mock Interviews.
 * Provides at least 50 curated, realistic campus interview questions across
 * Technical specializations, Core CS Fundamentals, HR, and Behavioral STAR scenarios.
 * Used for offline mode, provider rate limiting, and automated deterministic test suites.
 */

const FALLBACK_QUESTIONS = [
  // =========================================================================
  // 1. FRONTEND & WEB DEVELOPMENT (Technical)
  // =========================================================================
  {
    id: 'q_fe_01',
    question: 'How does React Virtual DOM reconciliation work, and when should you optimize rendering with useMemo or useCallback?',
    role: 'Frontend Developer',
    type: 'technical',
    category: 'technical',
    difficulty: 'intermediate',
    competency: 'React Performance & Rendering Architecture',
    expectedKeywords: ['virtual dom', 'diffing', 'reconciliation', 'memo', 'usecallback', 're-render'],
    idealAnswerGuidelines: 'Explain virtual tree representation, diffing algorithm (O(n) heuristics with keys), and how useMemo memoizes computed values while useCallback preserves function references across re-renders.',
  },
  {
    id: 'q_fe_02',
    question: 'Explain the browser critical rendering path from HTML byte parsing to final paint, and how async and defer script tags impact it.',
    role: 'Frontend Developer',
    type: 'technical',
    category: 'technical',
    difficulty: 'intermediate',
    competency: 'Browser Internals & Web Performance',
    expectedKeywords: ['dom', 'cssom', 'render tree', 'layout', 'paint', 'async', 'defer', 'parser-blocking'],
    idealAnswerGuidelines: 'Describe DOM and CSSOM generation, render tree construction, layout (reflow) and composite/paint steps. Differentiate async (downloads in background, executes immediately) and defer (executes in document order after parsing).',
  },
  {
    id: 'q_fe_03',
    question: 'What is Event Bubbling and Event Capturing in JavaScript, and how does Event Delegation utilize these phases?',
    role: 'Frontend Developer',
    type: 'technical',
    category: 'technical',
    difficulty: 'beginner',
    competency: 'DOM Event Propagation',
    expectedKeywords: ['event bubbling', 'event capturing', 'target', 'stoppropagation', 'delegation', 'listener'],
    idealAnswerGuidelines: 'Explain capturing (top-down), target phase, and bubbling (bottom-up). Explain delegation by placing a single event listener on a parent element leveraging bubbling to handle multiple dynamic child elements.',
  },
  {
    id: 'q_fe_04',
    question: 'How do CSS Flexbox and CSS Grid differ, and when would you choose one over the other for responsive layouts?',
    role: 'Frontend Developer',
    type: 'technical',
    category: 'technical',
    difficulty: 'beginner',
    competency: 'Modern CSS Layouts',
    expectedKeywords: ['flexbox', 'grid', 'one-dimensional', 'two-dimensional', 'responsive', 'align-items'],
    idealAnswerGuidelines: 'State clearly that Flexbox is 1D (rows or columns, ideal for navbars and lists) while Grid is 2D (rows and columns simultaneously, ideal for whole-page layouts).',
  },
  {
    id: 'q_fe_05',
    question: 'How would you architect client-side state management for a high-traffic e-commerce dashboard with cart, filters, and user profile data?',
    role: 'Frontend Developer',
    type: 'technical',
    category: 'system_design',
    difficulty: 'advanced',
    competency: 'Client State Architecture',
    expectedKeywords: ['global state', 'redux', 'context', 'cache', 'react query', 'optimistic updates', 'normalization'],
    idealAnswerGuidelines: 'Distinguish server cache (React Query/RTK Query) from local UI state. Mention normalized state, avoiding redundant re-renders, local storage persistence for cart, and optimistic UI updates.',
  },

  // =========================================================================
  // 2. BACKEND & DISTRIBUTED SYSTEMS (Technical)
  // =========================================================================
  {
    id: 'q_be_01',
    question: 'What are the key trade-offs between REST APIs and gRPC for microservice communications, and when is each appropriate?',
    role: 'Backend Developer',
    type: 'technical',
    category: 'technical',
    difficulty: 'intermediate',
    competency: 'API Architecture & Protocols',
    expectedKeywords: ['rest', 'grpc', 'http/2', 'protocol buffers', 'binary', 'latency', 'json', 'streaming'],
    idealAnswerGuidelines: 'Compare HTTP/1.1 JSON vs HTTP/2 binary protobufs, multiplexing, strict schema contracts, performance advantages of gRPC internally versus REST for public browser-facing APIs.',
  },
  {
    id: 'q_be_02',
    question: 'How do database indexes (B-Trees) accelerate read queries, and what costs do they introduce for write-heavy workloads?',
    role: 'Backend Developer',
    type: 'technical',
    category: 'technical',
    difficulty: 'intermediate',
    competency: 'Database Indexing & Storage Engines',
    expectedKeywords: ['b-tree', 'lookup', 'logarithmic', 'write penalty', 'overhead', 'composite index'],
    idealAnswerGuidelines: 'Explain balanced tree logarithmic O(log N) traversal, index leaf pointers to disk blocks, and write penalties (insert/update/delete requires re-balancing tree and storage overhead).',
  },
  {
    id: 'q_be_03',
    question: 'Explain database transaction isolation levels (Read Uncommitted, Read Committed, Repeatable Read, Serializable) and the concurrency anomalies they prevent.',
    role: 'Backend Developer',
    type: 'technical',
    category: 'cs_fundamentals',
    difficulty: 'advanced',
    competency: 'ACID Concurrency & Transactions',
    expectedKeywords: ['acid', 'dirty read', 'non-repeatable read', 'phantom read', 'serializable', 'isolation'],
    idealAnswerGuidelines: 'Map each isolation level to the anomalies it prevents: dirty reads, non-repeatable reads, and phantom reads. Mention locking vs MVCC implementations.',
  },
  {
    id: 'q_be_04',
    question: 'How do you design a robust distributed rate limiter in Redis using sliding window counters or token buckets?',
    role: 'Backend Developer',
    type: 'technical',
    category: 'system_design',
    difficulty: 'advanced',
    competency: 'Distributed Systems & Rate Limiting',
    expectedKeywords: ['redis', 'sliding window', 'token bucket', 'lua script', 'atomicity', 'zset'],
    idealAnswerGuidelines: 'Explain token bucket or sliding window log using Redis ZSET with timestamps. Highlight Lua scripts for atomic execution to prevent race conditions across parallel application instances.',
  },
  {
    id: 'q_be_05',
    question: 'What is database connection pooling, why is it necessary in high-throughput Node.js or Java backends, and how do you prevent pool exhaustion?',
    role: 'Backend Developer',
    type: 'technical',
    category: 'technical',
    difficulty: 'intermediate',
    competency: 'Resource Management & High Throughput',
    expectedKeywords: ['connection pool', 'tcp handshake', 'exhaustion', 'timeout', 'idle connections', 'leak'],
    idealAnswerGuidelines: 'Explain TCP handshake and authentication overhead for each query. Discuss pool limits (min/max), timeout configs, proper connection release (try/finally or ORM disposal) to avoid leaks.',
  },

  // =========================================================================
  // 3. FULL STACK SDE & GENERAL SOFTWARE ENGINEERING (Technical)
  // =========================================================================
  {
    id: 'q_fs_01',
    question: 'Explain how JWT authentication works across client and server, where tokens should be stored securely, and how refresh token rotation operates.',
    role: 'Full Stack Developer',
    type: 'technical',
    category: 'technical',
    difficulty: 'intermediate',
    competency: 'Web Application Security & Authentication',
    expectedKeywords: ['jwt', 'access token', 'refresh token', 'httponly cookie', 'xss', 'csrf', 'rotation'],
    idealAnswerGuidelines: 'Explain header, payload, and signature verification. Recommend short-lived access tokens and httpOnly SameSite secure cookies for refresh tokens to defend against XSS and CSRF, with rotation upon reuse.',
  },
  {
    id: 'q_fs_02',
    question: 'How would you architect a real-time collaborative document editing system like Google Docs or Notion, handling concurrent edits?',
    role: 'Full Stack Developer',
    type: 'technical',
    category: 'system_design',
    difficulty: 'advanced',
    competency: 'Real-Time Concurrency & Conflict Resolution',
    expectedKeywords: ['websocket', 'operational transformation', 'crdt', 'concurrency', 'conflict resolution', 'eventual consistency'],
    idealAnswerGuidelines: 'Discuss WebSockets for bidirectional duplex streams, Operational Transformation (OT) or Conflict-free Replicated Data Types (CRDTs), and version vector state synchronization.',
  },
  {
    id: 'q_fs_03',
    question: 'What is CORS (Cross-Origin Resource Sharing), why does the browser enforce it, and how does a preflight OPTIONS request work?',
    role: 'Full Stack Developer',
    type: 'technical',
    category: 'technical',
    difficulty: 'beginner',
    competency: 'Browser Security Model',
    expectedKeywords: ['cors', 'same-origin policy', 'preflight', 'options', 'access-control-allow-origin', 'headers'],
    idealAnswerGuidelines: 'Explain Same-Origin Policy (protocol, domain, port). Explain preflight OPTIONS request triggered by non-simple headers/methods, and corresponding Access-Control-* server response headers.',
  },
  {
    id: 'q_fs_04',
    question: 'Describe your approach to database schema migrations in a live production environment with zero user downtime.',
    role: 'Full Stack Developer',
    type: 'technical',
    category: 'technical',
    difficulty: 'intermediate',
    competency: 'Production Deployment & Database Reliability',
    expectedKeywords: ['zero downtime', 'expand and contract', 'backward compatible', 'migration script', 'lock'],
    idealAnswerGuidelines: 'Explain the Expand and Contract pattern (add column/table, deploy dual-write code, backfill data, switch reads, remove old schema). Emphasize avoiding blocking table locks.',
  },

  // =========================================================================
  // 4. DATA SCIENCE & MACHINE LEARNING (Technical)
  // =========================================================================
  {
    id: 'q_ds_01',
    question: 'Explain the Bias-Variance tradeoff in machine learning models and how techniques like regularization and cross-validation address it.',
    role: 'Data Scientist',
    type: 'technical',
    category: 'technical',
    difficulty: 'intermediate',
    competency: 'Statistical Machine Learning Fundamentals',
    expectedKeywords: ['bias', 'variance', 'underfitting', 'overfitting', 'regularization', 'l1/l2', 'k-fold'],
    idealAnswerGuidelines: 'Define bias (systematic error/underfitting) and variance (sensitivity to training noise/overfitting). Explain L1 (Lasso) and L2 (Ridge) regularization and k-fold cross-validation.',
  },
  {
    id: 'q_ds_02',
    question: 'In an imbalanced classification problem (e.g. 99% negative, 1% positive), why is Accuracy misleading, and what metrics and techniques should you use?',
    role: 'Data Scientist',
    type: 'technical',
    category: 'technical',
    difficulty: 'intermediate',
    competency: 'Evaluation Metrics & Imbalanced Learning',
    expectedKeywords: ['precision', 'recall', 'f1-score', 'roc-auc', 'confusion matrix', 'smote', 'resampling'],
    idealAnswerGuidelines: 'Explain why a naive model predicting all negatives gets 99% accuracy. Recommend Precision, Recall, F1-Score, PR-AUC, and resampling techniques (SMOTE, class-weighted loss functions).',
  },
  {
    id: 'q_ds_03',
    question: 'How do Transformer self-attention mechanisms differ from traditional Recurrent Neural Networks (RNNs) for natural language processing?',
    role: 'Data Scientist',
    type: 'technical',
    category: 'technical',
    difficulty: 'advanced',
    competency: 'Deep Learning & Natural Language Processing',
    expectedKeywords: ['transformer', 'self-attention', 'query key value', 'parallelization', 'vanishing gradient', 'rnn'],
    idealAnswerGuidelines: 'Highlight RNN sequential computation bottleneck and vanishing gradients. Explain self-attention query-key-value dot product matrix multiplication enabling massive GPU parallelization across tokens.',
  },
  {
    id: 'q_ds_04',
    question: 'How would you detect and handle data leakage in a predictive modeling pipeline before production deployment?',
    role: 'Data Scientist',
    type: 'technical',
    category: 'technical',
    difficulty: 'intermediate',
    competency: 'ML Engineering & Pipeline Integrity',
    expectedKeywords: ['data leakage', 'train test split', 'target leakage', 'temporal split', 'pipeline'],
    idealAnswerGuidelines: 'Explain train-test contamination (fitting scalers/imputers on test set). Discuss target leakage through proxy features available only post-event. Recommend strict pipeline encapsulation and temporal splits.',
  },

  // =========================================================================
  // 5. DEVOPS & CLOUD INFRASTRUCTURE (Technical)
  // =========================================================================
  {
    id: 'q_devops_01',
    question: 'How do Docker Linux container primitives (namespaces and cgroups) isolate processes, and how does containerization differ from Hypervisor virtualization?',
    role: 'DevOps Engineer',
    type: 'technical',
    category: 'technical',
    difficulty: 'intermediate',
    competency: 'Container Runtime & Kernel Primitives',
    expectedKeywords: ['namespaces', 'cgroups', 'kernel', 'hypervisor', 'guest os', 'overhead'],
    idealAnswerGuidelines: 'Explain namespaces (PID, net, mount for isolation) and cgroups (CPU, memory, I/O limits). Contrast sharing host kernel vs hypervisor simulating hardware with full guest OS.',
  },
  {
    id: 'q_devops_02',
    question: 'What are the core differences between Blue-Green deployments and Canary deployments in Kubernetes, and how do you implement zero-downtime rollbacks?',
    role: 'DevOps Engineer',
    type: 'technical',
    category: 'system_design',
    difficulty: 'advanced',
    competency: 'CI/CD & Deployment Strategies',
    expectedKeywords: ['blue-green', 'canary', 'traffic routing', 'rollback', 'ingress', 'health checks'],
    idealAnswerGuidelines: 'Blue-Green spins up identical parallel environments and flips traffic via router/ingress. Canary routes a small percentage (e.g. 5%) to new version. Fast rollbacks occur by routing 100% traffic back immediately.',
  },
  {
    id: 'q_devops_03',
    question: 'Explain Infrastructure as Code (IaC) idempotency and state drift management using Terraform.',
    role: 'DevOps Engineer',
    type: 'technical',
    category: 'technical',
    difficulty: 'intermediate',
    competency: 'Infrastructure as Code & Configuration',
    expectedKeywords: ['iac', 'idempotency', 'state file', 'terraform plan', 'drift detection', 'locking'],
    idealAnswerGuidelines: 'Define idempotency (running code multiple times produces identical target state). Explain Terraform state file mapping real resources to declared configuration, state locking, and drift detection.',
  },

  // =========================================================================
  // 6. CORE COMPUTER SCIENCE FUNDAMENTALS (Technical)
  // =========================================================================
  {
    id: 'q_cs_01',
    question: 'Explain the four Coffman conditions necessary for a Deadlock in an Operating System, and how modern systems prevent or recover from deadlocks.',
    role: 'Common',
    type: 'technical',
    category: 'cs_fundamentals',
    difficulty: 'intermediate',
    competency: 'Operating Systems & Concurrency',
    expectedKeywords: ['mutual exclusion', 'hold and wait', 'no preemption', 'circular wait', 'banker algorithm'],
    idealAnswerGuidelines: 'Enumerate: Mutual exclusion, Hold and wait, No preemption, and Circular wait. Explain eliminating circular wait by ordering lock acquisition, or using Banker\'s algorithm.',
  },
  {
    id: 'q_cs_02',
    question: 'Describe the TCP 3-Way Handshake and 4-Way Termination process, explaining why SYN cookies are used to defend against SYN Flood attacks.',
    role: 'Common',
    type: 'technical',
    category: 'cs_fundamentals',
    difficulty: 'intermediate',
    competency: 'Computer Networks & Transport Protocols',
    expectedKeywords: ['syn', 'syn-ack', 'ack', 'fin', '3-way handshake', 'syn cookies', 'ddos'],
    idealAnswerGuidelines: 'Detail SYN -> SYN-ACK -> ACK connection establishment and FIN/ACK teardown. Explain SYN flood filling half-open connection backlog and SYN cookies encoding state into sequence number to eliminate memory storage.',
  },
  {
    id: 'q_cs_03',
    question: 'What is the difference between a Process and a Thread in modern OS architectures, and what resources are shared versus isolated?',
    role: 'Common',
    type: 'technical',
    category: 'cs_fundamentals',
    difficulty: 'beginner',
    competency: 'Operating Systems & Process Management',
    expectedKeywords: ['process', 'thread', 'address space', 'heap', 'stack', 'context switch'],
    idealAnswerGuidelines: 'Process has independent memory address space and file descriptors. Threads share code, data, and heap within the parent process, but possess independent program counter, registers, and stack.',
  },
  {
    id: 'q_cs_04',
    question: 'Explain how Hash Tables handle collisions using Chaining versus Open Addressing (Linear Probing), and what happens when the load factor exceeds a threshold.',
    role: 'Common',
    type: 'technical',
    category: 'cs_fundamentals',
    difficulty: 'intermediate',
    competency: 'Data Structures & Algorithms',
    expectedKeywords: ['hash table', 'collision', 'chaining', 'open addressing', 'load factor', 'rehash'],
    idealAnswerGuidelines: 'Explain separate chaining (linked lists/trees at buckets) vs open addressing (probing next free slot). Explain load factor (n/k) and dynamic array resizing with O(n) rehashing to maintain O(1) average lookup.',
  },
  {
    id: 'q_cs_05',
    question: 'What is the difference between Depth-First Search (DFS) and Breadth-First Search (BFS), and which data structures and complexity properties characterize each?',
    role: 'Common',
    type: 'technical',
    category: 'cs_fundamentals',
    difficulty: 'beginner',
    competency: 'Graph Algorithms',
    expectedKeywords: ['bfs', 'dfs', 'queue', 'stack', 'recursion', 'shortest path', 'o(v+e)'],
    idealAnswerGuidelines: 'BFS uses a Queue and explores level-by-level (finds unweighted shortest path). DFS uses a Stack/recursion and explores branch to leaf. Both operate with O(V+E) time complexity.',
  },

  // =========================================================================
  // 7. HR, PROFESSIONALISM & CULTURAL FIT (HR)
  // =========================================================================
  {
    id: 'q_hr_01',
    question: 'Tell me about yourself: highlight your technical trajectory, your core engineering passions, and what drives your career ambitions.',
    role: 'Common',
    type: 'hr',
    category: 'hr',
    difficulty: 'beginner',
    competency: 'Professional Introduction & Communication',
    expectedKeywords: ['education', 'projects', 'passion', 'growth', 'impact', 'problem solving'],
    idealAnswerGuidelines: 'Structure logically: past background (degree/academics), present strengths (hands-on projects/internships and technical proficiencies), and future aspirations tailored to company value.',
  },
  {
    id: 'q_hr_02',
    question: 'Why are you specifically interested in joining our company over other organizations visiting campus, and what value do you hope to contribute?',
    role: 'Common',
    type: 'hr',
    category: 'hr',
    difficulty: 'beginner',
    competency: 'Company Alignment & Value Proposition',
    expectedKeywords: ['culture', 'products', 'values', 'contribution', 'learning', 'mission'],
    idealAnswerGuidelines: 'Show specific knowledge of company products, culture, engineering scale, or tech stack. Articulate concrete ways you will contribute enthusiasm and fast technical learning.',
  },
  {
    id: 'q_hr_03',
    question: 'Where do you envision your technical and professional growth over the next 3 to 5 years?',
    role: 'Common',
    type: 'hr',
    category: 'hr',
    difficulty: 'beginner',
    competency: 'Career Vision & Ambition',
    expectedKeywords: ['ownership', 'mastery', 'mentorship', 'system design', 'architecture', 'growth'],
    idealAnswerGuidelines: 'Express realistic ambition: mastering core engineering stacks in year 1-2, taking end-to-end component ownership in year 3, and advancing toward architectural design and junior mentorship.',
  },
  {
    id: 'q_hr_04',
    question: 'If you are assigned to a technology stack or legacy framework that you have never worked with before, how do you ramp up and deliver results?',
    role: 'Common',
    type: 'hr',
    category: 'hr',
    difficulty: 'beginner',
    competency: 'Adaptability & Self-Directed Learning',
    expectedKeywords: ['documentation', 'proof of concept', 'mentorship', 'debugging', 'testing', 'adaptability'],
    idealAnswerGuidelines: 'Share a systematic approach: reading official docs, building a prototype/sandbox application, analyzing codebase test suites, and asking structured questions to senior colleagues.',
  },
  {
    id: 'q_hr_05',
    question: 'How do you prioritize multiple competing project deadlines and academic examinations under tight schedule constraints?',
    role: 'Common',
    type: 'hr',
    category: 'hr',
    difficulty: 'beginner',
    competency: 'Time Management & Stress Resilience',
    expectedKeywords: ['prioritization', 'breakdown', 'eisenhower matrix', 'communication', 'milestones'],
    idealAnswerGuidelines: 'Discuss task triage (impact vs urgency), breaking milestones into achievable sprints, transparent stakeholder communication when roadblocks occur, and staying calm under pressure.',
  },
  {
    id: 'q_hr_06',
    question: 'Are you open to relocating to a different development center or working in hybrid/flexible shifts to support distributed global engineering teams?',
    role: 'Common',
    type: 'hr',
    category: 'hr',
    difficulty: 'beginner',
    competency: 'Flexibility & Global Readiness',
    expectedKeywords: ['relocation', 'flexibility', 'global collaboration', 'hybrid', 'adaptable'],
    idealAnswerGuidelines: 'Affirm enthusiasm for geographic mobility and adaptability to collaborate across global timezone boundaries as a professional growth opportunity.',
  },
  {
    id: 'q_hr_07',
    question: 'What is your greatest technical strength, and what is one technical area you are actively working to improve this year?',
    role: 'Common',
    type: 'hr',
    category: 'hr',
    difficulty: 'beginner',
    competency: 'Self-Awareness & Continuous Learning',
    expectedKeywords: ['strength', 'weakness', 'improvement', 'courses', 'practice', 'growth mindset'],
    idealAnswerGuidelines: 'Highlight a concrete strength backed by projects. For the area to improve, mention a real technical challenge (e.g. system design, testing) paired with active remediation steps (books, open source, courses).',
  },
  {
    id: 'q_hr_08',
    question: 'Describe how you maintain work-life balance and mental well-being during intensive development sprints and exam periods.',
    role: 'Common',
    type: 'hr',
    category: 'hr',
    difficulty: 'beginner',
    competency: 'Personal Well-being & Sustainability',
    expectedKeywords: ['balance', 'exercise', 'hobbies', 'time boundaries', 'mental wellness'],
    idealAnswerGuidelines: 'Demonstrate mature habits: physical exercise, structured time boundaries, unplugging during downtime, and maintaining sustainable productivity without chronic burnout.',
  },

  // =========================================================================
  // 8. BEHAVIORAL & STAR SCENARIOS (Behavioral)
  // =========================================================================
  {
    id: 'q_beh_01',
    question: 'Describe a situation where a major project or deadline was at critical risk. What specific actions did you take, and what was the outcome? (Use STAR method)',
    role: 'Common',
    type: 'behavioral',
    category: 'behavioral',
    difficulty: 'intermediate',
    competency: 'STAR: Execution Under Crisis',
    expectedKeywords: ['situation', 'task', 'action', 'result', 'deadline', 'priority', 'outcome'],
    idealAnswerGuidelines: 'Structure explicitly: Situation (context/risk), Task (your exact responsibility), Action (technical triage, team alignment, focused execution), Result (quantifiable delivery success).',
  },
  {
    id: 'q_beh_02',
    question: 'Tell me about a time you had a strong technical disagreement with a team member or project lead. How did you handle it and find resolution? (Use STAR method)',
    role: 'Common',
    type: 'behavioral',
    category: 'behavioral',
    difficulty: 'intermediate',
    competency: 'STAR: Conflict Resolution & Collaboration',
    expectedKeywords: ['situation', 'task', 'action', 'result', 'disagreement', 'data-driven', 'compromise'],
    idealAnswerGuidelines: 'Focus on constructive objectivity: evaluate trade-offs with benchmarks/prototyping, active listening, respectful alignment, and commitment to the chosen direction.',
  },
  {
    id: 'q_beh_03',
    question: 'Describe an experience where an engineering project or initiative failed or produced disappointing results. What did you learn and how did you adapt? (Use STAR method)',
    role: 'Common',
    type: 'behavioral',
    category: 'behavioral',
    difficulty: 'intermediate',
    competency: 'STAR: Resilience & Accountability',
    expectedKeywords: ['situation', 'task', 'action', 'result', 'failure', 'post-mortem', 'accountability', 'learning'],
    idealAnswerGuidelines: 'Take full personal ownership without blaming peers. Describe root cause analysis, implementing guardrails/tests to prevent recurrence, and the subsequent positive outcome.',
  },
  {
    id: 'q_beh_04',
    question: 'Tell me about a time when you stepped up and took leadership on a project without having an official title or authority. (Use STAR method)',
    role: 'Common',
    type: 'behavioral',
    category: 'behavioral',
    difficulty: 'intermediate',
    competency: 'STAR: Initiative & Ownership',
    expectedKeywords: ['situation', 'task', 'action', 'result', 'leadership', 'initiative', 'ownership', 'coordination'],
    idealAnswerGuidelines: 'Show proactive initiative: identifying an unowned gap, rallying teammates with clear task breakdown, driving daily check-ins, and achieving measurable project completion.',
  },
  {
    id: 'q_beh_05',
    question: 'Give an example of receiving critical or constructive feedback from a professor, manager, or peer review. How did you react and apply it? (Use STAR method)',
    role: 'Common',
    type: 'behavioral',
    category: 'behavioral',
    difficulty: 'intermediate',
    competency: 'STAR: Receptiveness & Growth Mindset',
    expectedKeywords: ['situation', 'task', 'action', 'result', 'feedback', 'improvement', 'code review'],
    idealAnswerGuidelines: 'Emphasize professional maturity: welcoming feedback non-defensively, asking clarifying questions, systematically revising work, and demonstrating tangible improvement.',
  },
  {
    id: 'q_beh_06',
    question: 'Describe a situation where you had to convey a complex technical problem or system architecture to a non-technical stakeholder or client. (Use STAR method)',
    role: 'Common',
    type: 'behavioral',
    category: 'behavioral',
    difficulty: 'intermediate',
    competency: 'STAR: Technical Communication & Empathy',
    expectedKeywords: ['situation', 'task', 'action', 'result', 'analogy', 'simplification', 'stakeholder', 'clarity'],
    idealAnswerGuidelines: 'Explain distilling jargon into intuitive real-world analogies, using architectural diagrams, verifying comprehension with interactive questions, and securing stakeholder alignment.',
  },
  {
    id: 'q_beh_07',
    question: 'Tell me about a time you went above and beyond the stated requirements of an assignment or feature to deliver exceptional quality. (Use STAR method)',
    role: 'Common',
    type: 'behavioral',
    category: 'behavioral',
    difficulty: 'intermediate',
    competency: 'STAR: Customer Obsession & Excellence',
    expectedKeywords: ['situation', 'task', 'action', 'result', 'above and beyond', 'quality', 'optimization', 'impact'],
    idealAnswerGuidelines: 'Describe identifying an unprompted opportunity (e.g. adding automated tests, improving page load speed by 40%, comprehensive docs) and the positive value it generated for users.',
  },
  {
    id: 'q_beh_08',
    question: 'Describe a scenario where you had to make a technical decision with incomplete or ambiguous specifications. (Use STAR method)',
    role: 'Common',
    type: 'behavioral',
    category: 'behavioral',
    difficulty: 'advanced',
    competency: 'STAR: Decision Making Under Ambiguity',
    expectedKeywords: ['situation', 'task', 'action', 'result', 'ambiguity', 'assumptions', 'mvp', 'prototyping'],
    idealAnswerGuidelines: 'Describe documenting explicit assumptions, building a quick minimal proof-of-concept, establishing fast feedback loops with stakeholders, and adjusting direction adaptively.',
  },

  // =========================================================================
  // 9. MOBILE & QA / TEST AUTOMATION (Technical)
  // =========================================================================
  {
    id: 'q_mob_01',
    question: 'How do Flutter or React Native bridge the gap between cross-platform code and native OEM components, and how do you optimize rendering FPS?',
    role: 'Mobile Developer',
    type: 'technical',
    category: 'technical',
    difficulty: 'intermediate',
    competency: 'Cross-Platform Mobile Architecture',
    expectedKeywords: ['flutter', 'skia', 'react native', 'bridge', 'jsc', 'fps', 'threads'],
    idealAnswerGuidelines: 'Contrast Flutter compiling directly to native ARM code via Skia/Impeller vs React Native JSI/Bridge architecture. Discuss offloading expensive computations to background isolates/threads.',
  },
  {
    id: 'q_qa_01',
    question: 'Explain the Test Pyramid concept (Unit, Integration, End-to-End) and how you design automated CI/CD quality gates to catch regressions early.',
    role: 'QA Engineer',
    type: 'technical',
    category: 'technical',
    difficulty: 'intermediate',
    competency: 'Test Automation & Quality Engineering',
    expectedKeywords: ['test pyramid', 'unit test', 'integration test', 'e2e', 'mocking', 'ci/cd', 'regression'],
    idealAnswerGuidelines: 'Explain fast, cheap unit tests at the base, service integration in the middle, and selective E2E tests at the apex. Discuss automated quality gates blocking merges on test failures.',
  },
  {
    id: 'q_qa_02',
    question: 'How do you design a robust automated test suite for an asynchronous REST API that depends on third-party payment and SMS webhooks?',
    role: 'QA Engineer',
    type: 'technical',
    category: 'technical',
    difficulty: 'advanced',
    competency: 'Asynchronous API Testing & Mocking',
    expectedKeywords: ['mock server', 'webhook', 'idempotency', 'polling', 'wiremock', 'async'],
    idealAnswerGuidelines: 'Discuss using mock servers (WireMock/Nock) to simulate third-party payloads, testing retries and idempotency keys, verifying database state updates, and handling async timeout delays.',
  },
  // =========================================================================
  // 9. CYBERSECURITY, MOBILE & ADVANCED ARCHITECTURE
  // =========================================================================
  {
    id: 'q_sec_01',
    question: 'Explain how Cross-Site Scripting (XSS) and Cross-Site Request Forgery (CSRF) vulnerabilities occur in web applications and how modern defenses mitigate them.',
    role: 'Security Engineer',
    type: 'technical',
    category: 'technical',
    difficulty: 'intermediate',
    competency: 'Application Security & Web Vulnerabilities',
    expectedKeywords: ['xss', 'csrf', 'content security policy', 'samesite', 'httponly', 'sanitization', 'token'],
    idealAnswerGuidelines: 'Differentiate stored/reflected XSS from CSRF. Explain defense-in-depth: HTML output encoding, Content-Security-Policy (CSP), HttpOnly cookies, SameSite=Strict/Lax cookie flags, and Anti-CSRF synchronizer tokens.',
  },
  {
    id: 'q_mob_01',
    question: 'How does Flutter achieve cross-platform rendering using its Skia/Impeller engine compared to React Native bridge architecture?',
    role: 'Mobile Developer',
    type: 'technical',
    category: 'technical',
    difficulty: 'intermediate',
    competency: 'Mobile Rendering Engines & Architecture',
    expectedKeywords: ['flutter', 'react native', 'skia', 'impeller', 'bridge', 'jsc', 'rendering', 'widgets'],
    idealAnswerGuidelines: 'Explain that Flutter compiles directly to native ARM code and draws UI directly on a canvas via Skia/Impeller, whereas React Native historically passes serialized JSON messages across a JS-to-native bridge.',
  },
  {
    id: 'q_cld_01',
    question: 'What are the architectural advantages and trade-offs of using Serverless Functions (e.g. AWS Lambda) versus containerized microservices on Kubernetes?',
    role: 'DevOps Engineer',
    type: 'technical',
    category: 'system_design',
    difficulty: 'advanced',
    competency: 'Cloud Compute Architecture',
    expectedKeywords: ['serverless', 'lambda', 'kubernetes', 'cold start', 'cost', 'stateful', 'autoscaling'],
    idealAnswerGuidelines: 'Highlight serverless benefits (instant autoscaling, pay-per-invocation, zero infrastructure management) vs trade-offs (cold starts, execution timeouts, vendor lock-in, stateful service constraints). Contrast with Kubernetes operational control.',
  },
  {
    id: 'q_ml_01',
    question: 'Explain data leakage in machine learning pipelines, why it happens, and how cross-validation and feature scaling should be structured to prevent it.',
    role: 'Data Scientist',
    type: 'technical',
    category: 'technical',
    difficulty: 'intermediate',
    competency: 'Machine Learning Pipeline Rigor',
    expectedKeywords: ['data leakage', 'train test split', 'cross-validation', 'fit_transform', 'scaling', 'bias'],
    idealAnswerGuidelines: 'Explain that fitting scalers or imputers on the entire dataset before splitting leaks test set distribution into training. Show that transformations must be fit strictly on training splits and evaluated on unseen validation splits.',
  },
  {
    id: 'q_cs_norm_01',
    question: 'Compare Database Normalization (3NF/BCNF) and Denormalization. Under what production scenarios would you intentionally denormalize a relational schema?',
    role: 'Backend Developer',
    type: 'technical',
    category: 'cs_fundamentals',
    difficulty: 'intermediate',
    competency: 'Relational Database Schema Design',
    expectedKeywords: ['normalization', '3nf', 'denormalization', 'join overhead', 'read-heavy', 'redundancy', 'integrity'],
    idealAnswerGuidelines: 'Explain normalization removes data anomalies and redundancy at the cost of JOIN operations. Explain intentional denormalization in read-heavy analytics/dashboards where query latency outweighs write synchronization costs.',
  },
  {
    id: 'q_sys_ratelimit',
    question: 'How would you design a distributed API rate limiter? Compare Token Bucket and Leaky Bucket algorithms.',
    role: 'Backend Developer',
    type: 'technical',
    category: 'system_design',
    difficulty: 'advanced',
    competency: 'Distributed System Design',
    expectedKeywords: ['rate limiter', 'token bucket', 'leaky bucket', 'redis', 'sliding window', 'concurrency'],
    idealAnswerGuidelines: 'Explain Token Bucket permits burst traffic while maintaining an average rate, whereas Leaky Bucket smooths traffic to a constant egress rate. Discuss Redis atomic increments or Lua scripts for distributed concurrency.',
  },
  {
    id: 'q_beh_roadblock',
    question: 'Tell me about a time you encountered a major technical roadblock or critical bug just before a project deadline. How did you diagnose and overcome it?',
    role: 'Software Engineer',
    type: 'behavioral',
    category: 'behavioral',
    difficulty: 'intermediate',
    competency: 'Resilience & Crisis Problem-Solving',
    expectedKeywords: ['situation', 'task', 'action', 'result', 'root cause', 'debugging', 'post-mortem'],
    idealAnswerGuidelines: 'Structure with STAR: Define the urgent failure (Situation/Task), methodical root-cause debugging steps and temporary mitigation (Action), and final resolution with post-mortem guardrails (Result).',
  },
  {
    id: 'q_beh_ambiguity',
    question: 'Describe a situation where you had to work with incomplete or conflicting project requirements. How did you establish clarity and deliver results?',
    role: 'Software Engineer',
    type: 'behavioral',
    category: 'behavioral',
    difficulty: 'intermediate',
    competency: 'Navigating Ambiguity & Stakeholder Communication',
    expectedKeywords: ['situation', 'task', 'action', 'result', 'stakeholders', 'clarification', 'iteration'],
    idealAnswerGuidelines: 'Structure with STAR: Describe ambiguous mandate, proactive discovery interviews with users/professors/clients, incremental prototype validation, and successful delivery on time.',
  },
  {
    id: 'q_beh_critique',
    question: 'Can you share an experience where a peer or team lead gave you critical feedback on your code or architecture? How did you respond and adapt?',
    role: 'Software Engineer',
    type: 'behavioral',
    category: 'behavioral',
    difficulty: 'intermediate',
    competency: 'Receptiveness to Feedback & Continuous Growth',
    expectedKeywords: ['situation', 'task', 'action', 'result', 'code review', 'humility', 'improvement'],
    idealAnswerGuidelines: 'Structure with STAR: Describe the code review critique, objective technical evaluation without ego, refactoring implementation, and long-term knowledge retention.',
  },
  {
    id: 'q_hr_growth',
    question: 'Where do you see yourself technically and professionally in the next three years, and how do you continuously keep up with evolving technology stacks?',
    role: 'Software Engineer',
    type: 'hr',
    category: 'hr',
    difficulty: 'beginner',
    competency: 'Career Vision & Continuous Learning Habit',
    expectedKeywords: ['career goals', 'specialization', 'open source', 'continuous learning', 'mentorship'],
    idealAnswerGuidelines: 'Articulate a realistic progression (deepening systems/cloud mastery, contributing to production systems, mentoring freshers), and specific learning habits (reading RFCs, building hobby projects, following tech blogs).',
  },
];

/**
 * Normalizes string for fuzzy keyword or role matching
 */
function normalizeText(text) {
  return String(text || '').toLowerCase().trim();
}

/**
 * Intelligently select questions from fallback bank matching role, type, difficulty, and skills.
 * Guarantees exactly `count` unique questions.
 */
function selectFallbackQuestions({
  role = 'Full Stack Developer',
  type = 'mixed',
  difficulty = 'intermediate',
  skills = [],
  count = 5,
} = {}) {
  const normRole = normalizeText(role);
  const normType = normalizeText(type);
  const normDiff = normalizeText(difficulty);
  const skillSet = new Set(skills.map((s) => normalizeText(s)));

  let pool = [...FALLBACK_QUESTIONS];

  // 1. Filter by requested interview type if not 'mixed'
  if (normType && normType !== 'mixed') {
    const typeMatches = pool.filter((q) => q.type === normType);
    if (typeMatches.length >= count) {
      pool = typeMatches;
    }
  }

  // 2. Score questions by relevance to role, difficulty, and student skills
  const scored = pool.map((q) => {
    let score = 0;

    // Role affinity
    const qRole = normalizeText(q.role);
    if (qRole === normRole || normRole.includes(qRole) || qRole.includes(normRole)) {
      score += 15;
    } else if (qRole === 'common') {
      score += 5;
    }

    // Skill affinity
    for (const kw of q.expectedKeywords) {
      if (skillSet.has(normalizeText(kw))) {
        score += 8;
      }
    }

    // Difficulty affinity
    if (q.difficulty === normDiff) {
      score += 4;
    }

    // Diversity bonus for mixed type
    if (normType === 'mixed') {
      if (q.type === 'technical') score += 2;
      if (q.type === 'behavioral') score += 3;
      if (q.type === 'hr') score += 1;
    }

    return { question: q, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // If mixed, ensure at least 1 technical, 1 behavioral, and 1 HR question if available
  const selected = [];
  const seenIds = new Set();

  if (normType === 'mixed' && count >= 3) {
    const techQ = scored.find((item) => item.question.type === 'technical')?.question;
    const behQ = scored.find((item) => item.question.type === 'behavioral')?.question;
    const hrQ = scored.find((item) => item.question.type === 'hr')?.question;

    if (techQ) {
      selected.push(techQ);
      seenIds.add(techQ.id);
    }
    if (behQ && !seenIds.has(behQ.id)) {
      selected.push(behQ);
      seenIds.add(behQ.id);
    }
    if (hrQ && !seenIds.has(hrQ.id)) {
      selected.push(hrQ);
      seenIds.add(hrQ.id);
    }
  }

  // Fill remaining slots from highest scored
  for (const item of scored) {
    if (selected.length >= count) break;
    if (!seenIds.has(item.question.id)) {
      selected.push(item.question);
      seenIds.add(item.question.id);
    }
  }

  // Fallback to top items if pool was depleted
  while (selected.length < count && selected.length < FALLBACK_QUESTIONS.length) {
    const nextQ = FALLBACK_QUESTIONS.find((q) => !seenIds.has(q.id));
    if (!nextQ) break;
    selected.push(nextQ);
    seenIds.add(nextQ.id);
  }

  return selected.map((q, idx) => ({
    questionId: `q_${Date.now()}_${idx}_${q.id}`,
    question: q.question,
    category: q.category,
    competency: q.competency,
    expectedKeywords: q.expectedKeywords,
    idealAnswerGuidelines: q.idealAnswerGuidelines,
  }));
}

module.exports = {
  FALLBACK_QUESTIONS,
  selectFallbackQuestions,
};
