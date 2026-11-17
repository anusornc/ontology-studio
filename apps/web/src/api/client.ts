import type {
  Ontology,
  OntologySummary,
  ValidationReport
} from "@onto/core";

/** File formats offered by the Export menu. */
export type ExportFormat = "turtle" | "jsonld" | "json";

/** A downloaded export, ready to be handed to the browser. */
export interface ExportResult {
  filename: string;
  content: string;
}

export interface CreateOntologyInput {
  name: string;
  description?: string;
  baseIri?: string;
  version?: string;
}

/** The public seam between the studio UI and the HTTP API. */
export interface OntologyApi {
  listOntologies(): Promise<OntologySummary[]>;
  getOntology(id: string): Promise<Ontology>;
  createOntology(input: CreateOntologyInput): Promise<Ontology>;
  saveOntology(ontology: Ontology): Promise<Ontology>;
  deleteOntology(id: string): Promise<void>;
  validateOntology(id: string): Promise<ValidationReport>;
  exportOntology(id: string, format: ExportFormat): Promise<ExportResult>;
}

export interface CreateOntologyApiOptions {
  /** Base URL prepended to `/api`; defaults to a same-origin relative path. */
  baseUrl?: string;
  /** Injectable fetch implementation (tests pass a mock). */
  fetch?: typeof fetch;
}

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

/** Error raised for every non-2xx response or transport failure. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(message: string, status: number, code: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return typeof value === "object" && value !== null && "error" in value;
}

function parseFilename(contentDisposition: string | null, format: ExportFormat): string {
  const fallback =
    format === "turtle" ? "ontology.ttl" : format === "jsonld" ? "ontology.jsonld" : "ontology.json";
  if (!contentDisposition) return fallback;
  const match = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return match?.[1]?.trim() || fallback;
}

export function createOntologyApi(options: CreateOntologyApiOptions = {}): OntologyApi {
  const baseUrl = (options.baseUrl ?? "").replace(/\/+$/, "");
  const doFetch: typeof fetch = options.fetch ?? ((...args) => fetch(...args));

  async function request(path: string, init?: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, init);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      throw new ApiError(`Network error: ${message}`, 0, "network_error");
    }

    if (!response.ok) {
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      const apiError = isApiErrorPayload(payload) ? payload.error : undefined;
      throw new ApiError(
        apiError?.message ?? `Request failed with status ${response.status}`,
        response.status,
        apiError?.code ?? "http_error",
        apiError?.details
      );
    }

    return response;
  }

  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await request(path, init);
    return (await response.json()) as T;
  }

  const jsonHeaders = { "content-type": "application/json" };

  return {
    async listOntologies() {
      const body = await requestJson<{ ontologies: OntologySummary[] }>("/api/ontologies");
      return body.ontologies;
    },

    async getOntology(id) {
      return requestJson<Ontology>(`/api/ontologies/${encodeURIComponent(id)}`);
    },

    async createOntology(input) {
      return requestJson<Ontology>("/api/ontologies", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(input)
      });
    },

    async saveOntology(ontology) {
      return requestJson<Ontology>(`/api/ontologies/${encodeURIComponent(ontology.id)}`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify(ontology)
      });
    },

    async deleteOntology(id) {
      await request(`/api/ontologies/${encodeURIComponent(id)}`, { method: "DELETE" });
    },

    async validateOntology(id) {
      return requestJson<ValidationReport>(`/api/ontologies/${encodeURIComponent(id)}/validate`, {
        method: "POST"
      });
    },

    async exportOntology(id, format) {
      const response = await request(
        `/api/ontologies/${encodeURIComponent(id)}/export?format=${format}`
      );
      return {
        filename: parseFilename(response.headers.get("content-disposition"), format),
        content: await response.text()
      };
    }
  };
}
