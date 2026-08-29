window.FOUNDATION_STUDY=[
{id:'python',title:'Python Engineering',summary:'Working-level Python matters because AI systems are still software systems: APIs, data movement, validation, testing and failure handling.',points:[['Core language and design','Know collections, comprehensions, functions, classes, dataclasses, type hints and composition. Prefer small components with explicit interfaces over deep inheritance.','Typing helps communicate contracts; composition usually keeps AI/data components easier to test and swap.'],['Generators and resource safety','Generators yield one item at a time, which avoids materializing huge datasets. Context managers guarantee cleanup of files, DB connections and other resources.','Use streaming patterns when data size can exceed memory.'],['API engineering','Real integrations need pagination, timeouts, retries, backoff, logging and configuration—not just requests.get().','Always set timeouts; distinguish transient failures from permanent ones.'],['Validation and testing','Pydantic or equivalent schema validation should guard boundaries. Unit tests cover pure logic; integration tests cover APIs, databases and contracts.','Validate before side effects.'],['Reusable pipeline structure','A common decomposition is Connector → Validator → Parser → Transformer → Writer. Each stage has one job and can be tested independently.','A reusable framework isolates source-specific code behind adapters.']],codeTitle:'Streaming API ingestion sketch',code:`from collections.abc import Iterator
import requests

def pages(url: str) -> Iterator[dict]:
    next_url = url
    while next_url:
        r = requests.get(next_url, timeout=10)
        r.raise_for_status()
        payload = r.json()
        yield from payload["items"]
        next_url = payload.get("next")

for row in pages("https://api.example/items"):
    process(row)`,takeaway:'Explain Python through production behavior: memory, contracts, error boundaries and testability—not syntax trivia.',trap:'Do not say async automatically makes code faster. It mainly helps when work is I/O-bound and can overlap.'},
{id:'ingestion',title:'Enterprise Data Ingestion Architecture',summary:'The goal is not another pipeline. The goal is a repeatable onboarding pattern where source-specific logic is minimized and controls are reusable.',points:[['Layered ingestion flow','Separate acquisition, immutable/raw landing, validation, parsing/normalization, enrichment, quality and serving/indexing. Raw landing gives you replayability.','Keep the original payload so downstream logic can be rerun without hitting the source again.'],['Cross-cutting controls','Security, metadata, lineage, observability, audit, versioning and orchestration apply across all stages.','Do not bolt governance on after the pipeline is built.'],['Batch, streaming and incremental patterns','Batch processes bounded sets; streaming processes events continuously. Incremental loads use CDC, timestamps, watermarks or source change tokens.','Choose the simplest mode that meets freshness requirements.'],['Idempotency and replay','A rerun should not duplicate data or create inconsistent state. Use deterministic keys, merge/upsert semantics and run metadata.','Replayability is a first-class production requirement.'],['Schema evolution and backfills','Sources change. Track schema versions, detect incompatible changes and isolate them before they silently corrupt downstream data.','Backward-compatible changes can often flow; breaking changes require explicit handling.'],['Failure routing and lineage','Use success, retry, quarantine/dead-letter paths. Lineage should trace a served record or chunk back to source object, version and ingestion run.','A failed record should not necessarily fail the whole batch.']],codeTitle:'Idempotent upsert pattern',code:`# Pseudocode / SQL pattern
MERGE target t
USING staged s
  ON t.business_key = s.business_key
WHEN MATCHED AND s.updated_at > t.updated_at
  THEN UPDATE SET ...
WHEN NOT MATCHED
  THEN INSERT (...);

# ingestion_run_id + source_version are stored for lineage/replay`,takeaway:'Frame ingestion as contracts plus reusable stages. The 20th source should be cheaper to onboard than the first.',trap:'A queue, lake or orchestration product is not an architecture by itself; explain responsibilities and failure semantics.'},
{id:'docintel',title:'Document Intelligence',summary:'Document processing is about preserving meaning and structure, not merely extracting characters from PDFs.',points:[['Classification and parsing','First identify document type and whether OCR is needed. Digital PDFs and scanned images should not follow identical paths.','Use OCR only where the source has no reliable text layer.'],['Preserve structure','Headings, sections, lists, tables, figures, footnotes and page references often carry semantics required for retrieval and citation.','Flattening everything to plain text can destroy evidence.'],['Format-specific handling','PDF, Word, PowerPoint, HTML and spreadsheets expose different structure. Build a canonical document model that normalizes common concepts while retaining useful source metadata.','Normalize without erasing source-specific meaning.'],['Parsing quality is AI quality','A parser can return “success” while misreading tables or losing headings. That failure later looks like a RAG or model problem.','Evaluate extraction, not just job completion.'],['Gold-set evaluation','Create representative documents with known expected text, tables and structure. Compare parsers on the content your users actually query.','Benchmark difficult pages, not only easy samples.']],codeTitle:'Canonical document model sketch',code:`from dataclasses import dataclass

@dataclass
class Block:
    kind: str       # paragraph | heading | table
    text: str
    page: int
    metadata: dict

@dataclass
class Document:
    source_id: str
    version: str
    blocks: list[Block]`,takeaway:'If retrieval quality is poor, inspect parsing before changing embeddings or models.',trap:'“PDF to text succeeded” does not mean the document was correctly understood.'},
{id:'chunking',title:'Chunking',summary:'Chunking defines the retrieval unit. It is an empirical design decision driven by document structure and query behavior.',points:[['Chunking strategies','Fixed-token is simple; recursive/paragraph approaches follow boundaries; semantic and structure-aware methods try to preserve meaning; parent-child schemes retrieve small units but return larger context.','Start simple, then earn complexity with eval results.'],['Small chunk trade-off','Small chunks can improve retrieval precision but may separate definitions, qualifications or evidence from surrounding context.','Precision improves only if meaning is not fragmented.'],['Large chunk trade-off','Large chunks preserve context but introduce irrelevant text, lower precision and consume more tokens.','More context is not automatically better context.'],['Evaluate rather than guess','Compare strategies on representative questions using retrieval and end-to-end metrics. There is no universal optimal size.','A default such as 500 tokens is a starting hypothesis, not a best practice.']],codeTitle:'Simple structure-aware chunking',code:`def chunks(sections, max_chars=1800):
    out = []
    for heading, paragraphs in sections:
        buf = f"# {heading}\n"
        for p in paragraphs:
            if len(buf) + len(p) > max_chars:
                out.append(buf)
                buf = f"# {heading}\n"
            buf += p + "\n"
        if buf.strip(): out.append(buf)
    return out`,takeaway:'Discuss chunk size as a precision/context/cost trade-off validated by experiments.',trap:'Never defend one magic chunk size for every document type.'},
{id:'retrieval',title:'Retrieval and AI Search',summary:'Retrieval quality comes from matching the right search technique to the query and corpus, then ranking evidence well.',points:[['Lexical retrieval','BM25 and keyword search are strong for exact codes, product names, rare terms and literal phrases.','Exact-match signals remain valuable in enterprise search.'],['Dense/vector retrieval','Embeddings retrieve semantically related text even when wording differs. They can miss exact identifiers or over-match broad semantic similarity.','Vector search is complementary, not universally superior.'],['Hybrid retrieval','Combine lexical and vector candidates to improve robustness across exact and semantic queries.','Hybrid search often reduces one-method blind spots.'],['Retrieval pipeline','Typical flow: query normalization → candidate retrieval → metadata/ACL filters → reranking → context selection.','Treat retrieval and reranking as separate responsibilities.'],['Reranking','A more expensive model re-scores a small candidate set and improves which evidence reaches the LLM.','Spend expensive ranking compute after cheap candidate generation.']],codeTitle:'Hybrid retrieval idea',code:`lexical = bm25.search(query, k=20)
semantic = vector.search(embed(query), k=20)

candidates = reciprocal_rank_fusion(lexical, semantic)
allowed = [d for d in candidates if user_can_read(d)]
final = reranker.rank(query, allowed)[:6]`,takeaway:'When retrieval is weak, diagnose parsing, chunking, metadata, query formulation and ranking before blaming embeddings.',trap:'Do not send unauthorized candidates to the model and filter only afterward.'},
{id:'rag',title:'RAG Architecture',summary:'RAG has an offline knowledge pipeline and an online query pipeline. Strong designs make provenance, access and evaluation explicit.',points:[['Offline indexing path','Documents are parsed, normalized, chunked, enriched with metadata, embedded and indexed. Version each major transformation.','You need to know which parser/chunker/embedding produced an index.'],['Online query path','The user question is normalized, retrieved, filtered, reranked, assembled into context, sent to the model and returned with citations.','Retrieval is a pipeline, not one vector-search call.'],['Cross-cutting controls','Evaluation, security, observability, lineage and versioning span both offline and online paths.','RAG is a production system, not an LLM prompt.'],['Layered diagnosis','Wrong answers can come from ingestion, parsing, chunking, retrieval, ranking, context assembly or generation. Diagnose the layer.','Do not change the LLM before proving the LLM is the failing component.']],codeTitle:'Minimal grounded answer flow',code:`docs = retrieve(question, user_entitlements)
ranked = rerank(question, docs)[:5]
context = "\n\n".join(d.text for d in ranked)

answer = llm.generate(
    question=question,
    context=context,
    require_citations=True,
)
return answer, [d.source_id for d in ranked]`,takeaway:'Be able to draw offline, online and cross-cutting controls from memory.',trap:'RAG does not eliminate hallucination; it provides evidence and a mechanism to measure grounding.'},
{id:'evaluation',title:'RAG and AI Evaluation',summary:'Evaluation converts subjective “looks better” iteration into measurable engineering decisions.',points:[['Retrieval metrics','Recall@K asks whether relevant evidence appears in top K. Precision@K asks how much of top K is relevant. MRR rewards early first-relevant results; NDCG handles graded relevance and rank.','Retrieval metrics answer different questions—pick the one matching the task.'],['Generation metrics','Measure correctness, completeness, relevance, groundedness/faithfulness and citation accuracy.','Fluent output is not evidence of correctness.'],['End-to-end task success','The real metric is whether the user can complete the business task correctly and efficiently.','Model quality is a component metric; business outcome is the system metric.'],['Golden evaluation set','Store question, expected answer or criteria, expected evidence, metadata and difficulty/type. Include difficult and high-risk cases.','A gold set should reflect real production failure modes.'],['Regression and decision making','Use evals before releases, model swaps, prompt changes, chunking changes and retrieval experiments.','Every significant AI change should have a measurable acceptance criterion.']],codeTitle:'Tiny evaluation harness',code:`cases = [
  {"q":"What is policy X?", "expected_doc":"P-17"},
]

for c in cases:
    docs = retrieve(c["q"], k=5)
    recall = c["expected_doc"] in [d.id for d in docs]
    answer = answer_question(c["q"], docs)
    log(c["q"], recall=recall, answer=answer)`,takeaway:'Evaluate retrieval, generation and end-to-end task success separately so failures are diagnosable.',trap:'An LLM judge is useful but should not be your only ground truth for high-risk correctness.'},
{id:'graphrag',title:'GraphRAG and Knowledge Graphs',summary:'Graphs become valuable when relationships, entity identity and multi-hop reasoning materially improve retrieval.',points:[['Graph basics','Represent entities as nodes, relationships as edges and attributes as properties. Graph traversal retrieves by relationship structure rather than text similarity alone.','Graphs encode explicit relationships that vectors only approximate.'],['Entity and relation extraction','You must identify entities, normalize them and connect relationships. Entity resolution quality is foundational.','Bad entity resolution creates bad graph reasoning.'],['When GraphRAG helps','It is useful for multi-hop questions such as customer → subsidiary → agreement → covenant or interconnected research topics.','Use it when relationships are central to the question.'],['Complexity cost','Graph construction, schema design, entity resolution, updates and hybrid retrieval add operational burden.','Prove incremental value over strong hybrid RAG.']],codeTitle:'Graph traversal example (Cypher)',code:`MATCH (c:Customer {id:$customer_id})-[:OWNS]->(s:Subsidiary)
MATCH (s)-[:HAS_AGREEMENT]->(a:Agreement)
MATCH (a)-[:HAS_COVENANT]->(cv:Covenant)
RETURN s.name, a.id, cv.text`,takeaway:'Explain both when GraphRAG is justified and when ordinary hybrid RAG is simpler and better.',trap:'Using Neo4j or a graph database does not automatically make retrieval “GraphRAG.”'},
{id:'agents',title:'AI Agents',summary:'An agent is best understood as a model participating in control flow, with tools and state bounded by trusted application code.',points:[['Core mental model','Think LLM + tools + state + control loop. The model can decide the next useful action based on intermediate results.','The model proposes actions; software executes them.'],['Tool calling and state','Tools extend the system into APIs, databases and services. State preserves what happened so later decisions have context.','Tool schemas and state contracts are engineering interfaces.'],['Deterministic versus agentic','Keep known processes deterministic. Add model-driven decisions only where ambiguity or dynamic reasoning creates value.','Do not make a fixed workflow probabilistic without a reason.'],['Enterprise controls','Agents need permissions, evaluation, human escalation, recovery, observability and cost controls.','A demo loop is not a production agent system.']],codeTitle:'Bounded agent loop sketch',code:`for step in range(MAX_STEPS):
    decision = model.decide(goal, state, tools)
    if decision.type == "final": return decision.answer
    call = validate(decision.tool_call)
    authorize(user, call)
    result = execute(call)
    state.append(result)
raise MaxStepsExceeded()`,takeaway:'Define the agent by control-flow behavior, not by LangChain/LangGraph.',trap:'Do not let the model become the authorization system.'},
{id:'platform',title:'AI / Data Platform Architecture',summary:'A platform should standardize common capabilities without forcing every use case into one rigid implementation.',points:[['Shared AI capabilities','Reusable services can include model gateway, ingestion, document parsing, retrieval, evaluation, observability, guardrails and agent runtime.','Centralize expensive common capabilities, not every application decision.'],['Paved roads','Provide supported patterns, templates and contracts that accelerate teams while allowing justified exceptions.','Standardization should reduce friction, not become bureaucracy.'],['Platform versus applications','The platform owns reusable infrastructure and policy enforcement; product teams own domain workflow and user experience.','Clear ownership prevents a central team from becoming the bottleneck.'],['Design for change','Models, vector stores and agent frameworks change quickly. Hide vendor-specific choices behind stable interfaces where practical.','Optimize for replaceability at volatile boundaries.']],codeTitle:'Stable interface idea',code:`class ModelGateway:
    def generate(self, request: ModelRequest) -> ModelResponse: ...

class Retriever:
    def search(self, query: Query, user: Identity) -> list[Document]: ...

# Applications depend on contracts, not one vendor SDK.`,takeaway:'Describe platform value as reuse + control + speed, not “centralize everything.”',trap:'A platform that requires central-team changes for every product feature is an organizational bottleneck.'},
{id:'security',title:'Security and Banking Controls',summary:'AI adds new attack surfaces, but core security principles remain: trusted identity, least privilege, boundary validation and auditable access.',points:[['Authentication and authorization','AuthN proves identity; AuthZ determines what that identity may do. Service identities should be scoped to the workload’s minimum required access.','Never confuse who the caller is with what they are allowed to access.'],['Sensitive data controls','Protect PII with encryption, controlled logging, data minimization, residency rules and output policy.','Do not send data to a model merely because technically possible.'],['AI-specific threats','Prompt injection can try to redirect tools or exfiltrate context; retrieval poisoning can insert malicious content into the knowledge base.','Treat retrieved content as untrusted input.'],['Entitlement propagation','Document ACLs must survive ingestion and become query-time filters so unauthorized evidence never enters model context.','Authorization must happen before context construction.']],codeTitle:'Authorization at retrieval boundary',code:`def retrieve_for_user(query, user):
    entitlements = entitlement_service.for_user(user.id)
    return index.search(
        query,
        filter={"business_unit": {"$in": entitlements}}
    )`,takeaway:'Say explicitly: LLMs propose; trusted systems authorize and execute.',trap:'A system prompt saying “do not reveal sensitive data” is not an access-control mechanism.'},
{id:'production',title:'Production Engineering',summary:'Production changes the question from “can it work?” to “can we operate it safely, repeatedly and economically?”',points:[['Operational requirements','Define reliability, scale, latency/SLA, monitoring, alerting, deployment, rollback, security, cost and ownership.','A working prototype has not solved operations.'],['AI-specific versioning','Track prompt, model, embedding model, parser, chunker, index and evaluation-set versions.','Without versioning, regressions are nearly impossible to reproduce.'],['Quality and platform metrics','Track request errors/latency plus retrieval quality, groundedness, tool failures, token usage and cost.','Separate system-health metrics from AI-quality metrics.'],['Lifecycle and rollback','Deploy changes gradually; preserve known-good versions and know which components can be rolled back independently.','AI systems need release discipline like any other production system.']],codeTitle:'Trace metadata example',code:`trace = {
  "run_id": run_id,
  "model":"gpt-x",
  "prompt_version":"v17",
  "index_version":"2026-08-29",
  "latency_ms": elapsed,
  "input_tokens": usage.input_tokens,
  "output_tokens": usage.output_tokens,
}`,takeaway:'Senior answers include ownership, rollback, quality telemetry and failure recovery.',trap:'A 200 HTTP response does not mean the AI result was correct.'},
{id:'researchprod',title:'Research-to-Production Methodology',summary:'Research creates value only when experiments lead to evidence-based product decisions and repeatable business outcomes.',points:[['Structured progression','Move Business Problem → Research Question → Hypothesis → Baseline → Experiment → Evaluation → Failure Analysis → Architecture → Hardening → Pilot → Value.','Start with a baseline so “improvement” has meaning.'],['POC versus production','A POC proves feasibility under controlled conditions. Production proves repeatable value under real constraints and failure modes.','Do not confuse technical possibility with operational viability.'],['Stop criteria','Define evidence that would cause you to abandon an approach. Research without stop criteria becomes a demo factory.','A strong researcher kills weak ideas quickly.']],codeTitle:'Experiment record',code:`experiment = {
  "hypothesis": "hybrid retrieval improves Recall@5 by >= 8%",
  "baseline": "vector-only v3",
  "dataset": "gold-set-2026-08",
  "accept_if": "recall_gain >= .08 and p95_latency < 900ms"
}`,takeaway:'Always state the baseline, hypothesis, metric and decision criterion.',trap:'“The demo looked impressive” is not evidence for production investment.'},
{id:'leadership',title:'Technical Leadership',summary:'Technical leadership is the ability to improve decisions and engineering quality without becoming the only person who can make progress.',points:[['Challenge through evidence','When you disagree with an approach, clarify assumptions, create a benchmark and demonstrate the failure mode rather than arguing from authority.','Turn opinion into a testable engineering question.'],['Coach while preserving ownership','Ask the engineer to propose alternatives, review trade-offs together and let them implement the revised design.','Do not solve every problem for the team.'],['Create reusable learning','Document the pattern, test or architectural decision so the next engineer benefits without repeating the debate.','Leadership should increase team capability, not personal dependency.']],codeTitle:'Design-review checklist',code:`1. What assumption are we making?
2. What scale/failure case threatens it?
3. What benchmark can prove or disprove it?
4. What simpler alternative exists?
5. Who owns the revised design and follow-up?`,takeaway:'Use a concrete technical story: problem, evidence, coaching action, decision and outcome.',trap:'Generic statements like “I mentor junior engineers” are too weak without a technical example.'},
{id:'research',title:'Current AI / Research Perspective',summary:'Interviewers care less about how many papers you read than whether you can turn a new idea into a disciplined experiment.',points:[['Agentic retrieval / deep research','Iterative systems plan, retrieve, assess evidence, identify gaps, retrieve again and synthesize. The value is adaptive evidence gathering, not a fancy loop.','Measure whether iteration materially improves task success.'],['Evaluation-driven engineering','Treat prompts, models and retrieval strategies like software changes: benchmark, measure, perform failure analysis and regression-test.','Evals are the feedback loop for AI engineering.'],['Enterprise data-analysis agents','A useful pattern is question → semantic intent → governed data discovery → tools/SQL → validation → analysis → explanation.','Keep calculations and access controls deterministic.'],['Research framing','For every trend answer four questions: what changed, why it matters, where the bank could use it, and what experiment you would run.','Translate hype into a falsifiable test.']],codeTitle:'Research question template',code:`Trend: agentic retrieval
Business problem: analysts miss evidence across large policy corpora
Hypothesis: iterative retrieval raises task success >10%
Baseline: hybrid RAG
Test: same gold set, same model, controlled token budget`,takeaway:'Your differentiator is research → experiment → evidence → architecture → value.',trap:'Listing new model/framework names without an experiment or business implication sounds superficial.'},
{id:'stories',title:'Your Five Interview Stories',summary:'Prepare a small number of technically deep stories that can survive follow-up questions from architecture down to implementation.',points:[['Five reusable stories','Prepare: difficult hands-on engineering; architecture from ambiguity; applied AI business problem; failure/diagnosis; technical leadership.','Depth beats having twenty shallow anecdotes.'],['Story anatomy','Know problem, context, your responsibility, architecture, decisions, alternatives, failure modes, personal contribution, result and what you would change now.','Interviewers will probe the seams of the story.'],['Evidence of ownership','Be precise about what you personally designed, coded, tested or decided versus what the broader team did.','Senior credibility depends on clear ownership.']],codeTitle:'Story skeleton',code:`Problem → Constraints → My role
Architecture → Decision → Rejected alternative
Failure / risk → What I personally did
Measured result → What I would change now`,takeaway:'For every story, prepare one architecture diagram, one hard trade-off, one failure mode and one measurable outcome.',trap:'Do not use “we” for everything; distinguish team outcome from your own contribution.'}
];