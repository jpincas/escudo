# Generated scenes

Illustrative photographs made with OpenAI `gpt-image-1`, used where a page needs
a picture of something we don't have a real photograph of.

**Nobody in them is a real person and nowhere in them is a real place.** Every
page that uses one says so in the caption — a project whose whole argument is
"be honest about the evidence" cannot pass synthetic images off as documentary
ones.

Real photographs of Bercianos live in `../photos-originals/`, and the signage
mockups built from them in `../photos-mockups/`. Prefer a real photograph
whenever one exists.

## Regenerating

Every prompt is in `manifest.json`, so the set is reproducible:

```sh
export OPENAI_API_KEY=...
python3 ~/.claude/skills/image-gen/gen.py --from-manifest graphics/photos-generated/manifest.json
```

It overwrites unconditionally. Add a scene by adding an entry, keeping the house
style: documentary 35mm, natural light, rural Castilla y León, ordinary clothes,
unposed, and no text anywhere in the frame.

Then `python3 ../sync-to-site.py` to publish them to `static/img/scenes/`.
