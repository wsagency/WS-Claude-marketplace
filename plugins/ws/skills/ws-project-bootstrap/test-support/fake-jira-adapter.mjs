export class FakeJiraAdapter {
	constructor(initialData = {}) {
		this.existingData = Object.fromEntries(Object.entries(initialData).map(([id, ticket]) => [
			id,
			{ version: 1, ...structuredClone(ticket) },
		]));
		this.outage = false;
		this.callLog = [];
		this.idCounter = 1;
		this.correlatedTickets = new Map();
		this.correlatedComments = new Map();
		for (const ticket of Object.values(this.existingData)) {
			if (ticket.correlationId) this.correlatedTickets.set(ticket.correlationId, ticket.id);
		}
	}

	simulateOutage(active) {
		this.outage = active;
	}

	getCallLog() {
		return this.callLog;
	}

	seedCorrelation(correlationId, jiraId) {
		this.correlatedTickets.set(correlationId, jiraId);
	}

	async getTicket(id) {
		this.callLog.push({ method: "getTicket", args: { id } });
		if (this.outage) throw new Error("Jira is unreachable");
		return this.existingData[id] ? structuredClone(this.existingData[id]) : null;
	}

	async findTicketByCorrelation(correlationId) {
		this.callLog.push({ method: "findTicketByCorrelation", args: { correlationId } });
		if (this.outage) throw new Error("Jira is unreachable");
		const jiraId = this.correlatedTickets.get(correlationId);
		return jiraId && this.existingData[jiraId] ? structuredClone(this.existingData[jiraId]) : null;
	}

	async createTicket(fields, correlationId) {
		const call = { method: "createTicket", args: { fields, correlationId } };
		this.callLog.push(call);
		if (this.outage) throw new Error("Jira is unreachable");
		let id;
		do {
			id = `PROJ-${this.idCounter++}`;
		} while (this.existingData[id]);
		const ticket = { id, version: 1, ...structuredClone(fields) };
		this.existingData[id] = ticket;
		if (correlationId) this.correlatedTickets.set(correlationId, id);
		call.args.resultId = id;
		return structuredClone(ticket);
	}

	async updateTicket(id, fields) {
		this.callLog.push({ method: "updateTicket", args: { id, fields } });
		if (this.outage) throw new Error("Jira is unreachable");
		if (!this.existingData[id]) throw new Error(`Unknown Jira ticket ${id}`);
		this.existingData[id] = {
			...this.existingData[id],
			...structuredClone(fields),
			version: this.existingData[id].version + 1,
		};
		return structuredClone(this.existingData[id]);
	}

	async updateStatus(id, status) {
		this.callLog.push({ method: "updateStatus", args: { id, status } });
		if (this.outage) throw new Error("Jira is unreachable");
		if (!this.existingData[id]) throw new Error(`Unknown Jira ticket ${id}`);
		this.existingData[id] = {
			...this.existingData[id],
			status,
			version: this.existingData[id].version + 1,
		};
		return structuredClone(this.existingData[id]);
	}

	async addComment(id, text, correlationId) {
		this.callLog.push({ method: "addComment", args: { id, text, correlationId } });
		if (this.outage) throw new Error("Jira is unreachable");
		if (!this.existingData[id]) throw new Error(`Unknown Jira ticket ${id}`);
		const correlationKey = `${id}:${correlationId}`;
		const existingId = this.correlatedComments.get(correlationKey);
		if (existingId) {
			const existing = (this.existingData[id].comments || []).find(comment => comment.id === existingId);
			if (!existing || existing.text !== text) {
				throw new Error(`Comment correlation ${correlationId} has mismatched ownership on ${id}`);
			}
			return { id: existing.id, version: this.existingData[id].version };
		}
		const commentId = `comment-${this.idCounter++}`;
		const comments = [...(this.existingData[id].comments || []), { id: commentId, text }];
		this.existingData[id] = {
			...this.existingData[id],
			comments,
			version: this.existingData[id].version + 1,
		};
		this.correlatedComments.set(correlationKey, commentId);
		return { id: commentId, version: this.existingData[id].version };
	}
}
