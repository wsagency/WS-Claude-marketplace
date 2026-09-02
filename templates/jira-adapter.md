# Canonical Local/Jira Adapter Template

This template defines the expected shape of a Jira Adapter required by the Local/Jira transactional synchronization engine. When integrating `runTrackerOperation`, the consumer must provide an adapter conforming exactly to these methods and signatures.

```javascript
/**
 * Canonical adapter mapping local operations to Jira API calls.
 */
export class JiraAdapter {
	constructor(apiClient, projectKey) {
		this.api = apiClient;
		this.projectKey = projectKey;
	}

	/**
	 * Retrieves a ticket from Jira and maps it to the standard TicketFields shape.
	 * @param {string} id - The Jira ticket ID (e.g., "PROJ-123").
	 * @returns {Promise<{ id: string, title: string, description: string, status: string, comments: Array<{id, text}> } | null>}
	 */
	async getTicket(id) {
		// Example:
		// const response = await this.api.get(`/issue/${id}`);
		// return mapJiraIssueToTicketFields(response.data);
		throw new Error("Not implemented");
	}

	/**
	 * Creates a new ticket in Jira and returns the created ticket's fields.
	 * The `correlationId` should be used as an idempotency key if supported by the Jira API.
	 * @param {Object} fields - The normalized fields (title, description, etc.).
	 * @param {string} correlationId - A deterministic hash for idempotency.
	 * @returns {Promise<{ id: string, title: string, description: string, status: string }>}
	 */
	async createTicket(fields, correlationId) {
		// Example:
		// const response = await this.api.post('/issue', { ...mapFieldsToJira(fields) }, { headers: { 'Idempotency-Key': correlationId } });
		// return mapJiraIssueToTicketFields(response.data);
		throw new Error("Not implemented");
	}

	/**
	 * Updates an existing ticket in Jira.
	 * @param {string} id - The Jira ticket ID.
	 * @param {Object} fields - The subset of fields to update.
	 * @returns {Promise<void>}
	 */
	async updateTicket(id, fields) {
		// Example:
		// await this.api.put(`/issue/${id}`, mapFieldsToJira(fields));
		throw new Error("Not implemented");
	}

	/**
	 * Adds a comment to the specified ticket in Jira.
	 * @param {string} id - The Jira ticket ID.
	 * @param {string} text - The comment text.
	 * @returns {Promise<{ id: string }>}
	 */
	async addComment(id, text) {
		// Example:
		// const response = await this.api.post(`/issue/${id}/comment`, { body: text });
		// return { id: response.data.id };
		throw new Error("Not implemented");
	}
}
```
