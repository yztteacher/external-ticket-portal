(function () {
  const SESSION_KEY = "external-ticket-auth-session";

  function createClient(projectUrl, anonKey) {
    const baseUrl = projectUrl.replace(/\/$/, "");

    function saveSession(session) {
      if (!session) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      const normalized = {
        ...session,
        expires_at: session.expires_at || Math.floor(Date.now() / 1000) + (session.expires_in || 3600),
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
      return normalized;
    }

    function storedSession() {
      try {
        return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      } catch {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
    }

    async function tokenRequest(grantType, body) {
      const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=${grantType}`, {
        method: "POST",
        headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return { data: { session: null, user: null }, error: result };
      const session = saveSession(result);
      return { data: { session, user: result.user || null }, error: null };
    }

    const auth = {
      async getSession() {
        let session = storedSession();
        if (!session) return { data: { session: null }, error: null };
        if (session.expires_at > Math.floor(Date.now() / 1000) + 60) {
          return { data: { session }, error: null };
        }
        if (!session.refresh_token) {
          saveSession(null);
          return { data: { session: null }, error: null };
        }
        const refreshed = await tokenRequest("refresh_token", { refresh_token: session.refresh_token });
        if (refreshed.error) saveSession(null);
        return { data: { session: refreshed.data.session }, error: refreshed.error };
      },

      signInWithPassword({ email, password }) {
        return tokenRequest("password", { email, password });
      },

      async signOut() {
        const session = storedSession();
        try {
          if (session?.access_token) {
            await fetch(`${baseUrl}/auth/v1/logout`, {
              method: "POST",
              headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` },
            });
          }
        } finally {
          saveSession(null);
        }
        return { error: null };
      },
    };

    class QueryBuilder {
      constructor(table) {
        this.table = table;
        this.method = "GET";
        this.body = null;
        this.params = new URLSearchParams();
        this.returnRows = false;
        this.singleRow = false;
      }

      select(columns = "*") {
        this.params.set("select", columns);
        if (this.method !== "GET") this.returnRows = true;
        return this;
      }

      insert(values) {
        this.method = "POST";
        this.body = values;
        return this;
      }

      update(values) {
        this.method = "PATCH";
        this.body = values;
        return this;
      }

      delete() {
        this.method = "DELETE";
        return this;
      }

      eq(column, value) {
        this.params.set(column, `eq.${value}`);
        return this;
      }

      order(column, { ascending = true } = {}) {
        this.params.set("order", `${column}.${ascending ? "asc" : "desc"}`);
        return this;
      }

      single() {
        this.singleRow = true;
        return this;
      }

      async execute() {
        const { data: { session } } = await auth.getSession();
        const headers = {
          apikey: anonKey,
          Authorization: `Bearer ${session?.access_token || anonKey}`,
          "Content-Type": "application/json",
        };
        if (this.returnRows) headers.Prefer = "return=representation";
        const query = this.params.toString();
        const response = await fetch(`${baseUrl}/rest/v1/${this.table}${query ? `?${query}` : ""}`, {
          method: this.method,
          headers,
          body: this.body == null ? undefined : JSON.stringify(this.body),
        });
        let result = null;
        if (response.status !== 204) {
          const text = await response.text();
          result = text ? JSON.parse(text) : null;
        }
        if (!response.ok) return { data: null, error: result || { message: "请求失败" } };
        if (this.singleRow && Array.isArray(result)) result = result[0] || null;
        return { data: result, error: null };
      }

      then(resolve, reject) {
        return this.execute().then(resolve, reject);
      }
    }

    return {
      auth,
      from(table) {
        return new QueryBuilder(table);
      },
    };
  }

  window.supabase = { createClient };
})();
