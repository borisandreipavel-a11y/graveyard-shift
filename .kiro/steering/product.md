# Graveyard Shift

A text-adventure on-call simulator. The player is paged at 3 AM into a production outage rebuilt from a real published postmortem, types commands to investigate and fix it, then gets a debrief comparing their path with what the real responders did.

It revives two old technologies: the pager and the parser text adventure. Say "text adventure", not "MUD", unless two humans can share an incident.

## Players

- Engineers preparing for a first on-call shift.
- AI agents, playing the same scenarios through an MCP server.

## Scenarios

Content comes only from real published postmortems, one per scenario. Nothing is invented.

1. Cloudflare outage, 2 July 2019: https://blog.cloudflare.com/details-of-the-cloudflare-outage-on-july-2-2019
2. GitLab database outage, 31 January 2017: https://about.gitlab.com/blog/postmortem-of-database-outage-of-january-31/

## In scope

- The two scenarios above.
- A deployed web app playable without sign-in: pager intro, terminal-style transcript, incident clock, debrief.
- An MCP server with three tools: start, act, read state.

## Out of scope unless asked

Two humans in one incident, play over SSH, more scenarios, a leaderboard.

## RULE

Incident language is blameless, and each debrief links to its source postmortem. Reason: postmortems examine systems and decisions, not culprits, and the link lets players check the facts.
