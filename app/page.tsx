"use client";

import { useEffect, useRef, useState } from "react";

type ProviderId = "ollama" | "lmstudio" | "openai";
type RunStatus = "idle" | "running" | "success" | "error" | "stopped";

type Metrics = {
  tokensPerSecond: number | null;
  ttftMs: number | null;
  totalSeconds: number | null;
  outputTokens: number | null;
  estimated: boolean;
};

type HistoryItem = Metrics & {
  id: string;
  model: string;
  provider: string;
  createdAt: string;
};

const providers: Array<{ id: ProviderId; label: string; endpoint: string; model: string }> = [
  { id: "ollama", label: "Ollama", endpoint: "http://localhost:11434", model: "llama3.2:3b" },
  { id: "lmstudio", label: "LM Studio", endpoint: "http://localhost:1234", model: "local-model" },
  { id: "openai", label: "OpenAI互換", endpoint: "http://localhost:8080", model: "local-model" },
];

const emptyMetrics: Metrics = {
  tokensPerSecond: null,
  ttftMs: null,
  totalSeconds: null,
  outputTokens: null,
  estimated: false,
};

const defaultPrompt = "日本の四季それぞれの魅力を、簡潔に説明してください。";

function estimateTokens(text: string) {
  const japaneseChars = (text.match(/[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const otherChars = Math.max(0, text.length - japaneseChars);
  return Math.max(1, Math.ceil(japaneseChars * 0.9 + otherChars / 4));
}

function trimEndpoint(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function requestUrl(provider: ProviderId, endpoint: string) {
  const base = trimEndpoint(endpoint);
  if (provider === "ollama") {
    return base.endsWith("/api/generate") ? base : `${base}/api/generate`;
  }
  if (base.endsWith("/chat/completions")) return base;
  if (base.endsWith("/v1")) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

function statusLabel(status: RunStatus) {
  return {
    idle: "待機中",
    running: "計測中",
    success: "計測完了",
    error: "接続エラー",
    stopped: "停止済み",
  }[status];
}

function friendlyError(error: unknown, provider: ProviderId) {
  const message = error instanceof Error ? error.message : String(error);
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return provider === "ollama"
      ? "Ollama に接続できませんでした。Ollama が起動中か、エンドポイントと CORS 設定を確認してください。"
      : "ローカルサーバーに接続できませんでした。サーバーが起動中か、エンドポイントと CORS 設定を確認してください。";
  }
  return message.replace(/https?:\/\/[^\s]+/g, "指定したエンドポイント");
}

export default function Home() {
  const [provider, setProvider] = useState<ProviderId>("ollama");
  const [endpoint, setEndpoint] = useState(providers[0].endpoint);
  const [model, setModel] = useState(providers[0].model);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [maxTokens, setMaxTokens] = useState(128);
  const [temperature, setTemperature] = useState(0);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem("local-pulse-settings");
        const savedHistory = localStorage.getItem("local-pulse-history");
        if (saved) {
          const data = JSON.parse(saved) as Partial<{ provider: ProviderId; endpoint: string; model: string; prompt: string; maxTokens: number; temperature: number }>;
          if (data.provider && providers.some((item) => item.id === data.provider)) setProvider(data.provider);
          if (data.endpoint) setEndpoint(data.endpoint);
          if (data.model) setModel(data.model);
          if (data.prompt) setPrompt(data.prompt);
          if (data.maxTokens) setMaxTokens(data.maxTokens);
          if (typeof data.temperature === "number") setTemperature(data.temperature);
        }
        if (savedHistory) setHistory((JSON.parse(savedHistory) as HistoryItem[]).slice(0, 5));
      } catch {
        localStorage.removeItem("local-pulse-settings");
        localStorage.removeItem("local-pulse-history");
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("local-pulse-settings", JSON.stringify({ provider, endpoint, model, prompt, maxTokens, temperature }));
  }, [provider, endpoint, model, prompt, maxTokens, temperature, hydrated]);

  function chooseProvider(next: ProviderId) {
    if (status === "running") return;
    const currentDefault = providers.find((item) => item.id === provider);
    const nextDefault = providers.find((item) => item.id === next)!;
    setProvider(next);
    if (!endpoint || endpoint === currentDefault?.endpoint) setEndpoint(nextDefault.endpoint);
    if (!model || model === currentDefault?.model) setModel(nextDefault.model);
  }

  function appendChunk(content: string, startedAt: number, firstAt: number | null, currentText: string) {
    const next = currentText + content;
    setOutput(next);
    const now = performance.now();
    const estimatedTokens = estimateTokens(next);
    const generationSeconds = Math.max(0.001, (now - (firstAt ?? startedAt)) / 1000);
    setMetrics({
      tokensPerSecond: estimatedTokens > 1 ? (estimatedTokens - 1) / generationSeconds : 0,
      ttftMs: firstAt === null ? null : firstAt - startedAt,
      totalSeconds: (now - startedAt) / 1000,
      outputTokens: estimatedTokens,
      estimated: true,
    });
    return next;
  }

  async function runBenchmark() {
    if (!endpoint.trim() || !model.trim() || !prompt.trim()) {
      setError("エンドポイント、モデル名、テスト用プロンプトを入力してください。");
      setStatus("error");
      return;
    }

    try {
      new URL(requestUrl(provider, endpoint));
    } catch {
      setError("エンドポイントを http:// または https:// から始まるURLで入力してください。");
      setStatus("error");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("running");
    setError("");
    setOutput("");
    setCopied(false);
    setMetrics(emptyMetrics);

    const startedAt = performance.now();
    let firstTokenAt: number | null = null;
    let fullText = "";
    let exactTokens = 0;
    let evalDurationNs = 0;
    let serverTps = 0;

    try {
      const isOllama = provider === "ollama";
      const body = isOllama
        ? {
            model: model.trim(),
            prompt,
            stream: true,
            // Keep the benchmark focused on visible output tokens. Thinking-capable
            // models can otherwise spend the entire token budget before answering.
            think: false,
            options: { num_predict: maxTokens, temperature },
          }
        : {
            model: model.trim(),
            messages: [{ role: "user", content: prompt }],
            stream: true,
            stream_options: { include_usage: true },
            max_tokens: maxTokens,
            temperature,
          };

      const response = await fetch(requestUrl(provider, endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 240);
        throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
      }
      if (!response.body) throw new Error("ストリーミング応答を読み取れませんでした。");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processLine = (rawLine: string) => {
        let line = rawLine.trim();
        if (!line || line.startsWith(":")) return;
        if (line.startsWith("data:")) line = line.slice(5).trim();
        if (!line || line === "[DONE]") return;

        try {
          const data = JSON.parse(line) as {
            response?: string;
            eval_count?: number;
            eval_duration?: number;
            usage?: { completion_tokens?: number };
            choices?: Array<{ delta?: { content?: string }; text?: string }>;
            timings?: { predicted_per_second?: number };
          };
          const content = isOllama
            ? data.response ?? ""
            : data.choices?.[0]?.delta?.content ?? data.choices?.[0]?.text ?? "";

          if (content) {
            if (firstTokenAt === null) firstTokenAt = performance.now();
            fullText = appendChunk(content, startedAt, firstTokenAt, fullText);
          }
          if (data.eval_count) exactTokens = data.eval_count;
          if (data.eval_duration) evalDurationNs = data.eval_duration;
          if (data.usage?.completion_tokens) exactTokens = data.usage.completion_tokens;
          if (data.timings?.predicted_per_second) serverTps = data.timings.predicted_per_second;
        } catch {
          // Keep consuming the stream: some compatible servers emit non-data event lines.
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        lines.forEach(processLine);
        if (done) break;
      }
      if (buffer.trim()) processLine(buffer);

      const finishedAt = performance.now();
      if (!fullText) throw new Error("モデルからテキストが返りませんでした。モデル名とサーバー設定を確認してください。");

      const outputTokens = exactTokens || estimateTokens(fullText);
      const generationSeconds = Math.max(0.001, (finishedAt - (firstTokenAt ?? startedAt)) / 1000);
      const tokensPerSecond = evalDurationNs > 0
        ? outputTokens / (evalDurationNs / 1_000_000_000)
        : serverTps || Math.max(0, outputTokens - 1) / generationSeconds;
      const finalMetrics: Metrics = {
        tokensPerSecond,
        ttftMs: (firstTokenAt ?? finishedAt) - startedAt,
        totalSeconds: (finishedAt - startedAt) / 1000,
        outputTokens,
        estimated: exactTokens === 0,
      };

      setMetrics(finalMetrics);
      setStatus("success");
      const item: HistoryItem = {
        ...finalMetrics,
        id: crypto.randomUUID(),
        model: model.trim(),
        provider: providers.find((entry) => entry.id === provider)?.label ?? provider,
        createdAt: new Date().toISOString(),
      };
      const nextHistory = [item, ...history].slice(0, 5);
      setHistory(nextHistory);
      localStorage.setItem("local-pulse-history", JSON.stringify(nextHistory));
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setStatus("stopped");
        setError("計測を停止しました。途中までの出力はそのまま残しています。");
      } else {
        setStatus("error");
        setError(friendlyError(caught, provider));
      }
    } finally {
      abortRef.current = null;
    }
  }

  function stopBenchmark() {
    abortRef.current?.abort();
  }

  async function copyResult() {
    if (metrics.tokensPerSecond === null) return;
    const text = `LOCAL PULSE — ${model}\n生成速度 ${metrics.tokensPerSecond.toFixed(1)} tok/s / TTFT ${Math.round(metrics.ttftMs ?? 0)} ms / ${metrics.outputTokens ?? 0} tokens`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const selectedProvider = providers.find((item) => item.id === provider)!;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Local Pulse ホーム">Local Pulse</a>
        <span className="header-label">Local LLM Benchmark</span>
      </header>

      <section className="tool-intro" id="top">
        <div>
          <h1>ローカルLLM 速度計測</h1>
          <p>接続先とモデルを指定して、生成速度と応答開始時間を計測します。</p>
        </div>
        <span className={`tool-status ${status}`}>{statusLabel(status)}</span>
      </section>

      <section className="bench-grid" aria-label="ベンチマーク設定と結果">
        <div className="panel config-panel">
          <div className="section-heading">
            <h2>接続設定</h2>
            <p>使用しているローカルLLMサーバーを選択してください。</p>
          </div>

          <div className="provider-tabs" role="group" aria-label="プロバイダー">
            {providers.map((item) => (
              <button
                key={item.id}
                type="button"
                className={provider === item.id ? "active" : ""}
                onClick={() => chooseProvider(item.id)}
                aria-pressed={provider === item.id}
                disabled={status === "running"}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="field-group">
            <label htmlFor="endpoint">エンドポイント</label>
            <div className="input-shell">
              <input id="endpoint" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder={selectedProvider.endpoint} disabled={status === "running"} spellCheck={false} />
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="model">モデル名</label>
            <div className="input-shell">
              <input id="model" value={model} onChange={(event) => setModel(event.target.value)} placeholder={selectedProvider.model} disabled={status === "running"} spellCheck={false} />
            </div>
          </div>

          <details className="test-settings">
            <summary>計測条件 <span>開く</span></summary>
            <label htmlFor="prompt">テスト用プロンプト</label>
            <textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={status === "running"} rows={4} />
            <div className="setting-pair">
              <label htmlFor="max-tokens">最大出力 <input id="max-tokens" type="number" min="16" max="2048" step="16" value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value))} disabled={status === "running"} /><small>tokens</small></label>
              <label htmlFor="temperature">Temperature <input id="temperature" type="number" min="0" max="2" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} disabled={status === "running"} /></label>
            </div>
          </details>

          {status === "running" ? (
            <button className="run-button stop" type="button" onClick={stopBenchmark}>計測を停止</button>
          ) : (
            <button className="run-button" type="button" onClick={runBenchmark}>計測を開始</button>
          )}
        </div>

        <div className="panel results-panel" aria-live="polite">
          <div className="section-heading result-heading">
            <div>
              <h2>計測結果</h2>
              <p>ストリーミング応答から算出した値です。</p>
            </div>
            <span className={`waiting ${status}`}>{statusLabel(status)}</span>
          </div>

          <div className="primary-result">
            <span>生成速度 {metrics.estimated && metrics.outputTokens ? "（推定）" : ""}</span>
            <strong>{metrics.tokensPerSecond === null ? "--" : metrics.tokensPerSecond.toFixed(1)}<small> tok/s</small></strong>
            <p>1秒あたりに生成されたトークン数</p>
          </div>

          <div className="metric-row">
            <div><span>TTFT</span><strong>{metrics.ttftMs === null ? "--" : Math.round(metrics.ttftMs)}<small> ms</small></strong><p>最初の出力まで</p></div>
            <div><span>処理時間</span><strong>{metrics.totalSeconds === null ? "--" : metrics.totalSeconds.toFixed(2)}<small> s</small></strong><p>生成完了まで</p></div>
            <div><span>出力トークン</span><strong>{metrics.outputTokens ?? "--"}<small> tokens</small></strong><p>{metrics.estimated ? "概算値" : "API取得値"}</p></div>
          </div>

          <div className={`live-console ${error ? "has-error" : ""}`}>
            <div>
              <span className="console-label">{error ? "エラー" : "モデル出力"}</span>
              {status === "success" && <button type="button" onClick={copyResult}>{copied ? "コピーしました" : "結果をコピー"}</button>}
            </div>
            {error ? <p>{error}</p> : output ? <p className="output-text">{output}</p> : <p>計測を開始すると、モデルの出力がここに表示されます。</p>}
          </div>

          {status === "error" && (
            <details className="help-box">
              <summary>接続を確認する</summary>
              <ul>
                <li>ローカルLLMのサーバーが起動しているか確認する</li>
                <li>Ollama は通常ポート 11434、LM Studio は通常ポート 1234 を使います</li>
                <li>ブラウザからの接続を許可する CORS 設定をサーバー側で有効にする</li>
                <li>公開ページから接続できない場合は、このツールをローカルで起動する</li>
              </ul>
            </details>
          )}
        </div>
      </section>

      <section className="history-section">
        <div className="section-title">
          <div><h2>最近の計測</h2><p>直近5件の結果</p></div>
          {history.length > 0 && <button type="button" onClick={() => { setHistory([]); localStorage.removeItem("local-pulse-history"); }}>履歴を消去</button>}
        </div>
        {history.length === 0 ? (
          <div className="empty-history"><p>まだ計測結果がありません。</p></div>
        ) : (
          <div className="history-list">
            <div className="history-header"><span>モデル</span><span>生成速度</span><span>TTFT</span><span>日時</span></div>
            {history.map((item) => (
              <article key={item.id}>
                <div className="history-model"><span>{item.provider}</span><strong>{item.model}</strong></div>
                <div className="history-speed"><strong>{item.tokensPerSecond?.toFixed(1)}</strong><span> tok/s</span></div>
                <div className="history-ttft"><strong>{Math.round(item.ttftMs ?? 0)}</strong><span> ms</span></div>
                <time>{new Date(item.createdAt).toLocaleString("ja-JP")}</time>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
