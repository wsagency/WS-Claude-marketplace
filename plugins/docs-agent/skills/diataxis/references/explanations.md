# Writing Explanations

Explanations are **understanding-oriented** documentation that illuminates concepts, provides context, and deepens knowledge.

## Purpose

- Help readers understand why things are the way they are
- Provide context and background
- Illuminate connections between concepts
- Enable informed decision-making

## Characteristics

### Discursive and Reflective
Explore topics from multiple angles, discuss tradeoffs, and connect ideas.

### Context-Providing
Explain the history, reasoning, and constraints behind decisions.

### Thought-Provoking
Help readers think more deeply about the subject.

## Structure

```markdown
# Understanding [Concept]

## Introduction
Set the stage for what will be explored.

## Background
Historical context or foundational concepts.

## The Core Concept
Main explanation with analogies and examples.

## Why It Matters
Practical implications and applications.

## Common Misconceptions
Address frequent misunderstandings.

## Tradeoffs and Alternatives
Discuss different approaches and their implications.

## Conclusion
Summarize key insights.

## Further Reading
Links to deeper exploration.
```

## Writing Guidelines

### Do:
- Explain the "why" behind decisions
- Use analogies to clarify complex ideas
- Discuss tradeoffs and alternatives
- Connect concepts to the bigger picture
- Acknowledge complexity and nuance
- Reference historical context when relevant

### Don't:
- Include step-by-step instructions (use How-tos)
- Teach through exercises (use Tutorials)
- List technical specifications (use Reference)
- Be superficial—go deep

## Tone

Explanations should be:
- **Thoughtful** - Take time to explore ideas
- **Honest** - Acknowledge limitations and tradeoffs
- **Engaging** - Draw the reader in
- **Illuminating** - Shed new light on familiar topics

## Example Explanation

```markdown
# Understanding Database Indexing

## Introduction

When your database queries start slowing down, indexing is often
the first solution suggested. But what are indexes, really? And
why don't we just index everything?

## How Indexes Work

Think of a database index like the index at the back of a book.
Without it, finding information about "authentication" means
scanning every page. With an index, you flip to the back, find
"authentication: pages 42, 78, 156" and go directly there.

Database indexes work similarly. Instead of scanning every row
to find users named "Alice", the database consults an index that
says "Alice is in rows 7, 234, and 891."

## The B-Tree: Most Common Index Type

Most databases use B-tree indexes by default. The "B" stands for
"balanced," meaning the tree maintains roughly equal depth across
all branches. This balance guarantees consistent lookup times.

Consider searching for the number 42 in a million rows:
- Without an index: potentially 1,000,000 comparisons
- With a B-tree index: about 20 comparisons (log₂ of 1,000,000)

## Why Not Index Everything?

If indexes are so helpful, why not add one to every column? The
answer lies in understanding that indexes aren't free:

**Storage cost**: Each index duplicates data. A table with five
indexes might use more disk space for indexes than for the actual
data.

**Write penalty**: When you insert, update, or delete a row,
every index on that table must also be updated. Heavy write
workloads suffer with too many indexes.

**Maintenance overhead**: Indexes need periodic maintenance.
As data changes, B-trees can become unbalanced or fragmented.

## When to Add Indexes

The decision to add an index involves weighing:

1. **Query frequency**: How often is this column searched?
2. **Table size**: Small tables don't benefit much from indexes
3. **Write vs. read ratio**: Write-heavy tables pay a higher cost
4. **Column cardinality**: Columns with few unique values (like
   boolean flags) often don't benefit from traditional indexes

## Beyond B-Trees

B-trees excel at equality and range queries, but other index
types serve different needs:

- **Hash indexes**: Faster for exact matches, but can't do ranges
- **GiST/GIN**: Handle complex data types like full-text or JSON
- **Partial indexes**: Index only rows matching a condition

## Conclusion

Indexes are a fundamental database optimization, but they're not
magic. Understanding how they work—and their costs—helps you make
informed decisions about when and where to apply them.

## Further Reading

- [How to Analyze Query Performance](../howto/analyze-queries.md)
- [Index Configuration Reference](../reference/indexes.md)
- [PostgreSQL Index Types Explained](https://www.postgresql.org/docs/current/indexes-types.html)
```

## Common Mistakes

1. **Too shallow** - Don't just skim the surface
2. **No context** - Explain why things are the way they are
3. **Mixing in instructions** - Keep how-to content separate
4. **Avoiding complexity** - Embrace nuance and tradeoffs
5. **No conclusions** - Help readers synthesize what they learned
