export class FakeJiraAdapter {
	constructor(initialData = {}) {
		this.existingData = { ...initialData };
		this.outage = false;
		this.callLog = [];
		this.idCounter = 1;
		this.correlatedTickets = new Map();
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
		return this.existingData[id] || null;
	}

	async findTicketByCorrelation(correlationId) {
		this.callLog.push({ method: "findTicketByCorrelation", args: { correlationId } });
		if (this.outage) throw new Error("Jira is unreachable");
		const jiraId = this.correlatedTickets.get(correlationId);
		return jiraId ? this.existingData[jiraId] || null : null;
	}

	async createTicket(fields, correlationId) {
		const call = { method: "createTicket", args: { fields, correlationId } };
		this.callLog.push(call);
		if (this.outage) throw new Error("Jira is unreachable");
		let id;
		do {
			id = `PROJ-${this.idCounter++}`;
		} while (this.existingData[id]);
		const ticket = { id, ...fields };
		this.existingData[id] = ticket;
		if (correlationId) this.correlatedTickets.set(correlationId, id);
		call.args.resultId = id;
		return ticket;
	}

	async updateTicket(id, fields) {
		this.callLog.push({ method: "updateTicket", args: { id, fields } });
		if (this.outage) throw new Error("Jira is unreachable");
		if (this.existingData[id]) this.existingData[id] = { ...this.existingData[id], ...fields };
	}

	async addComment(id, text) {
		this.callLog.push({ method: "addComment", args: { id, text } });
		if (this.outage) throw new Error("Jira is unreachable");
		const commentId = `comment-${this.idCounter++}`;
		if (this.existingData[id]) {
			const comments = [...(this.existingData[id].comments || []), { id: commentId, text }];
			this.existingData[id] = { ...this.existingData[id], comments };
		}
		return { id: commentId };
	}
}
