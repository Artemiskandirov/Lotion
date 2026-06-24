# @lotion/mcp-physics

Standalone MCP server that exposes Lotion's physics + DSL helpers as tools to any MCP-aware client.

## Tools

- `spring_curve` — Disney-style spring keyframes.
- `validate_lottie` — structural validation of a Lottie 5.x document.
- `morph_compatibility` — checks whether two SVG paths share a vertex count for direct morphing.
- `disney_principles_check` — audits a `StoryboardDSL` for anticipation / overshoot / squash gaps.

## Run

```bash
npm --workspace @lotion/mcp-physics run start
```

## Register in Claude Code

Add to `~/.claude/mcp_servers.json`:

```json
{
  "mcpServers": {
    "lotion-physics": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/Lotion/packages/mcp-physics/src/server.ts"]
    }
  }
}
```
