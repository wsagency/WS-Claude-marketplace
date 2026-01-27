# Writing How-to Guides

How-to guides are **task-oriented** documentation that helps users accomplish specific goals.

## Purpose

- Solve a specific problem
- Get the user to their goal quickly
- Work for users with varying setups

## Characteristics

### Problem-Focused
Address a real-world task the user wants to complete.

### Practical and Direct
Skip theory—focus on steps that achieve the goal.

### Flexible
Accommodate different contexts and configurations.

## Structure

```markdown
# How to [Accomplish Task]

## Overview
One sentence describing what this guide covers.

## Prerequisites
- Required conditions before starting
- Necessary permissions or access

## Steps

### 1. [First action]
Instructions with code/commands.

### 2. [Second action]
Continue with next step.

[Continue steps...]

## Verification
How to confirm the task was successful.

## Troubleshooting
Common issues and solutions.

## Related
Links to related how-tos or reference.
```

## Writing Guidelines

### Do:
- Title with "How to [verb]..."
- Assume competence (they know the basics)
- Provide complete, working solutions
- Address common variations
- Include verification steps
- Link to reference for options/details

### Don't:
- Explain concepts (link to Explanations)
- Teach fundamentals (link to Tutorials)
- Provide exhaustive options (link to Reference)
- Assume specific setup unless stated

## Example How-to

```markdown
# How to Configure HTTPS for Your Application

## Overview
Set up HTTPS using Let's Encrypt certificates.

## Prerequisites
- Domain name pointing to your server
- Root/sudo access to the server
- Port 80 available for certificate verification

## Steps

### 1. Install Certbot

```bash
sudo apt update
sudo apt install certbot
```

### 2. Generate Certificate

```bash
sudo certbot certonly --standalone -d yourdomain.com
```

Enter your email when prompted.

### 3. Configure Your Application

Add the certificate paths to your config:

```yaml
ssl:
  cert: /etc/letsencrypt/live/yourdomain.com/fullchain.pem
  key: /etc/letsencrypt/live/yourdomain.com/privkey.pem
```

### 4. Restart Your Application

```bash
sudo systemctl restart myapp
```

## Verification

Open `https://yourdomain.com` in your browser. You should see
the padlock icon indicating a secure connection.

## Troubleshooting

**Certificate verification failed**
- Ensure port 80 is open: `sudo ufw allow 80`
- Check DNS is pointing to your server

**Application won't start**
- Verify certificate paths are correct
- Check file permissions on certificate files

## Related
- [How to Renew SSL Certificates](./renew-ssl.md)
- [SSL Configuration Reference](../reference/ssl-config.md)
```

## Differences from Tutorials

| Tutorials | How-to Guides |
|-----------|---------------|
| Learning-oriented | Task-oriented |
| For beginners | For practitioners |
| Follows a journey | Solves a problem |
| One specific path | Accommodates variations |
| Explains why | Focuses on how |

## Common Mistakes

1. **Too much explanation** - They want to finish, not learn
2. **Not enough context** - State prerequisites clearly
3. **Single-path assumption** - Acknowledge different setups
4. **Missing verification** - How do they know it worked?
5. **No troubleshooting** - Help when things go wrong
