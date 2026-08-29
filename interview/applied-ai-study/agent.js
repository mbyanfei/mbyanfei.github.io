window.AGENT_STUDY=[
{id:'m1',title:'What Is an Agent?',summary:'An agent is a software system in which the model participates in deciding the next action. Framework choice is secondary.',points:[['Control-flow participation','A chatbot can generate text without affecting execution. An agent uses goals, context and intermediate state to choose actions such as tool calls, routing or clarification.','The defining property is model participation in control flow.'],['Agent vs workflow','A deterministic workflow follows predefined transitions. An agentic workflow allows some transitions to be selected dynamically by the model.','You can mix deterministic and agentic steps.'],['Runtime authority','The LLM should not directly execute database calls or privileged APIs. It produces a proposal that trusted application code validates and executes.','Model decision and system execution are separate trust boundaries.'],['Bounded autonomy','Production agents normally need limits on tools, steps, time, cost and side effects.','“Autonomous” should mean controlled autonomy, not unlimited freedom.']],codeTitle:'Minimal agent loop',code:`for step in range(MAX_STEPS):
    action = model.decide(goal, state, available_tools)
    if action.type == "final":
        return action.answer

    call = validate(action.tool_call)
    authorize(user, call)
    result = execute(call)
    state.append({"call": call, "result": result})

raise MaxStepsExceeded()`,takeaway:'Define an agent by control flow and bounded action, not by whether LangGraph is present.',trap:'If removing LangGraph makes your “agent” cease to be an agent, you probably defined it by framework rather than behavior.'},
{id:'m2',title:'Why Agent?',summary:'Agentic behavior should be justified against a deterministic baseline. Add non-determinism only where it creates measurable value.',points:[['Start with the baseline','First ask whether rules and paths are already known. If yes, normal code or workflow is usually cheaper, safer and easier to test.','Deterministic by default.'],['Good agentic use cases','Ambiguous user intent, dynamic tool selection, open-ended research, planning and adaptive reasoning are stronger candidates.','Use the LLM where semantics or uncertainty matter.'],['Keep hard rules deterministic','Calculations, validation, authorization, irreversible actions and compliance rules should usually remain trusted deterministic logic.','Do not delegate policy truth to a probabilistic model.'],['Measure the benefit','Agentic complexity must buy something: better task success, lower manual effort, broader task coverage or faster completion.','Compare against a simpler baseline.']],codeTitle:'Controlled agentic pattern',code:`intent = llm.classify(user_request)      # semantic
validated = validate_request(intent)       # deterministic
plan = llm.choose_analysis(validated)      # adaptive
result = run_approved_tool(plan)            # deterministic execution
checked = business_rule_checks(result)      # deterministic
answer = llm.explain(checked)               # semantic`,takeaway:'A senior answer says exactly which steps need LLM reasoning and which steps deliberately do not.',trap:'“We used an agent because the framework supports agents” is not an architectural justification.'},
{id:'m3',title:'Tool Calling',summary:'Tool calling is a structured contract between a probabilistic model and trusted software.',points:[['Model proposes, runtime executes','The model emits a tool name and arguments. Your application validates them and invokes the actual API, database or function.','The LLM does not execute the API itself.'],['Schema validation','Use JSON Schema, Pydantic or equivalent to reject wrong types, missing fields and malformed structures.','Prompting is not validation.'],['Semantic validation','Schema-valid data can still be wrong—for example a negative payment amount or a customer ID outside the allowed scope.','Validate business meaning as well as syntax.'],['Authorization before execution','Resolve the user/workload identity and check permission before any sensitive tool runs.','The model cannot grant itself access.'],['Bounded repair','Recoverable bad arguments may get one or two repair attempts; persistent failure should clarify, escalate or stop.','Retries need limits and observability.']],codeTitle:'Validated tool execution',code:`from pydantic import BaseModel, Field

class BalanceArgs(BaseModel):
    customer_id: str = Field(min_length=1)

raw = model_tool_call()
args = BalanceArgs.model_validate(raw["arguments"])
authorize(user, "read_balance", args.customer_id)
result = balance_service.get(args.customer_id, timeout=5)`,takeaway:'Describe tool calling as a trust boundary with schema, business validation, AuthZ, timeout and logging.',trap:'A stronger prompt may reduce bad calls, but it does not replace application-side validation.'},
{id:'m4',title:'State, Checkpoints & Recovery',summary:'Production agents need explicit state so work can pause, fail, resume and be audited without relying on process memory.',points:[['What belongs in state','Typical state includes run ID, user/session identity, current node, normalized inputs, tool results, decisions, timestamps and version metadata.','Persist only what you need; do not turn state into an uncontrolled transcript dump.'],['Checkpoint boundaries','Checkpoint after expensive, external or human-interruptible steps where repeating work would be costly or unsafe.','A checkpoint is a recovery contract.'],['Resume vs replay','Replay reruns prior work; resume continues from a durable checkpoint. The choice depends on whether previous steps are safe to repeat.','Reads are often replayable; side effects may not be.'],['Version compatibility','If workflow code, schemas or prompts changed after a checkpoint was created, resume logic must verify compatibility or migrate state.','Persist version metadata with state.'],['Compensation','Some side effects cannot be rolled back automatically. Design compensating actions or human recovery paths.','Recovery is a business-semantic problem, not only a technical one.']],codeTitle:'Durable state sketch',code:`state = {
  "run_id": run_id,
  "user_id": user.id,
  "node": "analyze_transactions",
  "inputs": validated_input,
  "tool_results": results,
  "workflow_version": "v7",
  "updated_at": now(),
}
checkpoint_store.save(run_id, state)`,takeaway:'Be able to explain exactly what is persisted, when checkpoints occur, and what can safely be repeated.',trap:'“LangGraph has checkpoints” is not enough; the interviewer wants recovery semantics.'},
{id:'m5',title:'Reliability & Idempotency',summary:'Retries are safe only when failure type and side-effect semantics are understood.',points:[['Classify failures','Transient failures include network glitches or temporary overload; permanent failures include invalid input, missing permission or unsupported operations.','Do not retry permanent errors.'],['Timeout semantics','A timeout only tells the caller it did not receive a result. The server may still have completed the operation.','Timeout does not mean “nothing happened.”'],['Idempotency','An idempotent operation can be repeated without creating additional unintended effects. For writes, use idempotency keys or deduplication contracts.','Retry safety is a business property.'],['Backoff and jitter','Bound retries and progressively wait longer; jitter prevents many clients from retrying at the same instant.','Avoid retry storms.'],['Fallback and degradation','If the primary model/service is unavailable, use a safe alternate, cached/read-only mode, queue, or human escalation.','A degraded service is often better than uncontrolled failure.']],codeTitle:'Retry only when safe',code:`def call_with_retry(fn, *, idempotent: bool):
    for attempt in range(3):
        try:
            return fn(timeout=5)
        except TransientError:
            if not idempotent:
                raise
            sleep((2 ** attempt) + random.random())
    raise DependencyUnavailable()`,takeaway:'When asked “Would you retry?”, answer “it depends on failure class and idempotency.”',trap:'Blindly retrying a POST/payment/order can duplicate the business action.'},
{id:'m6',title:'RAG & Retrieval Quality',summary:'RAG quality is mostly an evidence pipeline problem: source quality, parsing, chunking, retrieval, ranking and context assembly all matter.',points:[['End-to-end RAG pipeline','Ingest → parse → chunk → metadata → embed/index → query transform → retrieve → filter → rerank → assemble context → generate → cite.','Vector search is only one stage.'],['Chunking trade-off','Too large adds noise and token cost; too small fragments meaning. Structure-aware and parent-child patterns often help.','Evaluate chunking on real questions.'],['Hybrid retrieval','Combine lexical matching for exact terms with semantic retrieval for concept similarity.','Enterprise queries often contain both exact and semantic signals.'],['Reranking','Retrieve a broad cheap candidate set, then apply a stronger ranker to a smaller set before context assembly.','Ranking quality determines what the model sees.'],['Freshness and provenance','Track source version/effective date and preserve citations so users can verify evidence and stale content can be reindexed.','A knowledge base is an operational data product.']],codeTitle:'RAG query path',code:`candidates = hybrid_search(query, k=30)
allowed = acl_filter(user, candidates)
ranked = rerank(query, allowed)[:6]
context = build_context(ranked, token_budget=6000)
answer = llm.answer(query, context, cite_sources=True)`,takeaway:'If an answer is bad, identify whether the evidence pipeline or generation layer failed before changing models.',trap:'RAG reduces unsupported answers only when the retrieved evidence is relevant, permitted and correctly used.'},
{id:'m7',title:'Evaluation',summary:'Production AI needs a layered evaluation system that can tell you what improved, what regressed and why.',points:[['Golden dataset','Build representative questions/tasks with trusted expected answers, evidence, tool choices or scoring rubrics. Include edge cases and high-risk cases.','Your eval set is part of the product.'],['Retrieval evaluation','Measure Recall@K, Precision@K, MRR/NDCG or task-specific evidence coverage separately from final generation.','Separate evidence failure from answer failure.'],['Agent evaluation','Measure tool selection, argument correctness, task completion, unnecessary steps, loop rate and escalation behavior.','Evaluate actions, not just prose.'],['LLM-as-a-judge','Use rubric-based judges for qualities that are hard to assert deterministically, but calibrate them against human review.','Judges are measurements, not unquestionable ground truth.'],['Production/business metrics','Track p50/p95 latency, cost, failure/retry rate, human escalation and real business outcomes such as time saved or error reduction.','The best model metric is not necessarily the best business metric.']],codeTitle:'Regression gate sketch',code:`result = run_eval(candidate_version, gold_set)
assert result.task_success >= 0.92
assert result.tool_arg_accuracy >= 0.98
assert result.p95_latency_ms < 2500
assert result.cost_per_success < 0.20

# compare by failure category, not only one average score`,takeaway:'Say “evaluate the system, not just the model.” Then name retrieval, tool, answer, operational and business metrics.',trap:'A prettier answer can score better subjectively while silently lowering task success.'},
{id:'m8',title:'Observability',summary:'Agent debugging requires one request-level view across prompts, model calls, retrieval, tools, state transitions and downstream services.',points:[['Trace the whole run','Use a run/trace ID from API entry through orchestration, model calls, retrieval, tools, DB/API calls and final response.','You need to reconstruct what happened.'],['Capture versions','Record model, prompt, tool schema, workflow and index versions so failures are reproducible.','Without versioning, traces lose diagnostic value.'],['Logs, metrics and traces','Logs explain events, metrics reveal trends/health, and traces show one request path across components.','Use all three; they answer different questions.'],['AI-quality telemetry','Capture token usage, tool failures, retrieval evidence IDs, step count, judge/eval signals and latency—not only HTTP status.','200 OK is not an AI-quality metric.'],['Privacy-aware logging','Do not indiscriminately log sensitive prompts, PII, secrets or full tool outputs. Use redaction and controlled access.','Observability itself can create data risk.']],codeTitle:'Trace span metadata',code:`with tracer.span("tool_call") as span:
    span.set("run_id", run_id)
    span.set("tool", call.name)
    span.set("prompt_version", PROMPT_VERSION)
    span.set("model", MODEL)
    result = execute(call)
    span.set("status", "ok")`,takeaway:'Debug by localizing the failure layer: retrieval, model decision, validation, tool execution, state or downstream data.',trap:'Logging everything may make debugging easy while creating a serious confidentiality problem.'},
{id:'m9',title:'Security, Identity & Governance',summary:'Security authority must live outside the model. Identity, entitlements, tool policy and downstream access are enforced by trusted components.',points:[['Authentication vs authorization','AuthN verifies the caller; AuthZ determines allowed resources/actions. Keep those decisions outside LLM reasoning.','The model can explain policy, but it should not be the policy engine.'],['User vs service identity','A backend may use its own workload/service identity downstream, or use on-behalf-of/delegated user context when per-user access is required.','Identity propagation is an architecture choice tied to entitlement requirements.'],['Least privilege','Tools and workload identities should expose only the operations and data required for the agent’s purpose.','Do not give a general-purpose agent a general-purpose database credential.'],['Prompt injection','Treat user input and retrieved documents as untrusted instructions. Tool permission checks and data boundaries must remain effective even if the model is manipulated.','Prompt injection is contained by architecture, not just prompt wording.'],['Audit','Record who initiated the action, what tool/data was accessed, policy outcome and business result where appropriate.','Regulated environments need reconstructable decisions.']],codeTitle:'Tool authorization boundary',code:`def execute_tool(user, call):
    policy = policy_engine.check(
        subject=user,
        action=call.name,
        resource=call.resource_id,
    )
    if not policy.allowed:
        raise Forbidden()
    return tool_registry[call.name](call.args)`,takeaway:'Memorize: LLM proposes actions; trusted systems authorize and execute actions.',trap:'A system prompt saying “never access salary data” is not authorization.'},
{id:'m10',title:'Context Engineering',summary:'Context engineering decides what information the model should receive at each step, with what authority, freshness and token budget.',points:[['Context sources','Context may include system policy, user request, conversation state, retrieved evidence, structured business data, tool results and memory.','Not all context has equal authority.'],['Relevance and token budget','More context can reduce quality by burying important evidence and increasing cost/latency. Include what the current decision needs.','Right context beats maximum context.'],['Memory vs source of truth','Conversation memory can summarize preferences/history, but authoritative values should be retrieved from systems of record when needed.','Do not let stale memory override fresh structured data.'],['Authority and freshness','Tag or structure context so the model can distinguish policy, user claims, retrieved documents and tool results.','Context should carry provenance.'],['Step-specific context','A planner may need tool descriptions; a SQL tool does not need the whole conversation; a final explainer may need verified results but not hidden operational details.','Build context per node, not one mega-prompt.']],codeTitle:'Context builder sketch',code:`def build_context(step, state):
    if step == "plan":
        return [SYSTEM_POLICY, state.user_request, tool_catalog()]
    if step == "analyze":
        return [ANALYSIS_RULES, state.verified_tool_results]
    if step == "respond":
        return [RESPONSE_POLICY, state.verified_results, state.citations]`,takeaway:'Prompt engineering writes instructions; context engineering controls the complete information environment around each model call.',trap:'Stuffing the whole conversation and all documents into every call is not sophisticated context engineering.'},
{id:'m11',title:'MCP',summary:'MCP standardizes how AI applications discover and interact with tools/resources. It does not replace application architecture.',points:[['What MCP solves','It creates a common interface for exposing tools, resources and related context to AI hosts/clients, reducing custom integration glue.','Think interoperability layer.'],['What MCP does not solve','It does not decide business workflow, guarantee tool correctness, implement your authorization policy, handle retries or provide evaluation automatically.','Protocol is not architecture.'],['MCP vs direct APIs','Direct REST/function integration can be simpler for a small controlled system. MCP becomes more attractive when many AI clients need standardized access to many tools/resources.','Adopt the protocol when reuse justifies it.'],['Security boundary','Authentication, authorization, allowed tool surface, transport security and audit still need deliberate design around the MCP connection.','Standard connectivity can also standardize attack surface.']],codeTitle:'Conceptual MCP layout',code:`AI Host / Agent Runtime
        |
     MCP Client
        |
   ----------------
   | MCP Server   |
   | tools       |
   | resources   |
   ----------------
        |
 Governed APIs / data / services

# Enterprise identity + policy still wrap this path.`,takeaway:'A strong answer is: “MCP is an integration protocol, not an agent framework or security model.”',trap:'Do not claim MCP makes a system agentic.'},
{id:'m12',title:'Multi-Agent Systems',summary:'Multi-agent is an additional coordination architecture. It should be introduced only when specialization or isolation is worth the complexity.',points:[['Default to simpler design','Start with one controlled workflow/agent. Specialized nodes or model calls often solve the problem without independent agents.','Earn multi-agent complexity.'],['When separation helps','Use separate agents when roles need distinct goals, tools, memory/context, security boundaries, parallel ownership or independently evolving policies.','There should be a concrete boundary.'],['Coordination cost','Multiple agents introduce message passing, shared-state problems, conflicting outputs, more tokens, more latency and harder evaluation.','Coordination is real system complexity.'],['Orchestrator patterns','A supervisor can route tasks to specialists; peer-to-peer designs are possible but harder to control. Deterministic orchestration often keeps MAS manageable.','Autonomy between agents should be bounded too.'],['Evaluate incremental value','Compare multi-agent against a single-agent/workflow baseline on quality, cost, latency and failure rate.','More agents is not automatically more intelligence.']],codeTitle:'Supervisor + specialist sketch',code:`task = supervisor.route(request)

if task == "research":
    result = research_agent.run(request)
elif task == "sql_analysis":
    result = data_agent.run(request)
else:
    result = deterministic_workflow(request)

return reviewer.validate(result)`,takeaway:'Many “multi-agent systems” are better understood as one orchestrated workflow with specialized nodes. Say that explicitly.',trap:'Adding a critic and writer model calls does not automatically justify calling the system a multi-agent architecture.'}
];