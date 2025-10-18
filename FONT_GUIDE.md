# 🔤 Font Loading Guide

Your service supports **3 ways** to load fonts. Choose based on your needs!

---

## 🎯 **Three Font Loading Methods**

### **1. Pre-installed Fonts** (Build Time) ⚡ FASTEST

Fonts baked into Docker image during build.

**When to use:** Common fonts you use frequently

**How to add:**
Edit `fonts-build.txt`:
```
Roboto:400,700
Open Sans:400,700
```

**How to use:**
```json
{
  "text": {
    "spans": [{
      "fontFamily": "Roboto"  // No fonts parameter needed!
    }]
  }
}
```

**Performance:** Instant (already loaded)

---

### **2. Google Fonts** (Runtime - By Name) 🔥 FLEXIBLE

Download any Google Font on-demand by name.

**When to use:** Rare Google Fonts not in your build list

**How to use:**
```json
{
  "components": [...],
  "fonts": {
    "Pacifico": "Pacifico",
    "Dancing Script": "Dancing Script",
    "Bebas Neue": "Bebas Neue"
  }
}
```

**Performance:**
- First request: ~200-500ms (downloads once)
- Subsequent: Instant (cached in `.fonts-cache/`)

---

### **3. Custom Fonts** (Runtime - By URL) 🎨 COMPLETE CONTROL

Download fonts from your own URLs.

**When to use:** Brand fonts, proprietary fonts, custom fonts

**How to use:**
```json
{
  "components": [...],
  "fonts": {
    "My Brand Font": "https://cdn.yourcompany.com/fonts/brand.ttf",
    "Corporate Sans": "https://storage.googleapis.com/bucket/corporate.woff2",
    "Special Font": "https://assets.example.com/fonts/special.otf"
  }
}
```

**Supported formats:** `.ttf`, `.otf`, `.woff`, `.woff2`

**Performance:**
- First request: ~200-500ms (downloads once)
- Subsequent: Instant (cached)

---

## 💡 **Mix and Match!**

Use all three methods in one request:

```json
{
  "components": [
    {
      "text": {
        "spans": [{
          "text": "Pre-installed",
          "fontFamily": "Roboto"
        }]
      }
    },
    {
      "text": {
        "spans": [{
          "text": "Google on-demand",
          "fontFamily": "Pacifico"
        }]
      }
    },
    {
      "text": {
        "spans": [{
          "text": "Custom URL",
          "fontFamily": "My Brand Font"
        }]
      }
    }
  ],
  "dimensions": { "width": 1000, "height": 600 },
  "fonts": {
    "Pacifico": "Pacifico",
    "My Brand Font": "https://cdn.example.com/brand.ttf"
  }
}
```

---

## 📊 **Performance Comparison**

| Method | First Request | Subsequent | Build Time | Use Case |
|--------|--------------|------------|------------|----------|
| Pre-installed | Instant | Instant | +2-3 min | Common fonts (Roboto, Arial) |
| Google by name | ~300ms | Instant | 0 | Rare Google Fonts |
| Custom URL | ~300ms | Instant | 0 | Your brand/custom fonts |

---

## ✅ **Best Practice**

1. **Pre-install** your top 10-20 most-used fonts in `fonts-build.txt`
2. Use **Google by name** for occasional Google Fonts
3. Use **custom URLs** for your proprietary/brand fonts

This gives you:
- ✅ Fast builds (only common fonts pre-installed)
- ✅ Small Docker image
- ✅ Flexibility (any font on-demand)
- ✅ Caching (fonts downloaded once)

---

## 🚀 **Examples**

### Example 1: Pre-installed only (fastest)
```bash
curl -X POST http://localhost:3000/render \
  -d '{"components":[{"type":"text","text":{"spans":[{"fontFamily":"Roboto"}]}}],"dimensions":{"width":1000,"height":500}}'
```

### Example 2: Google Font on-demand
```bash
curl -X POST http://localhost:3000/render \
  -d '{
    "components":[{"type":"text","text":{"spans":[{"fontFamily":"Pacifico","text":"Hello"}]}}],
    "dimensions":{"width":1000,"height":500},
    "fonts":{"Pacifico":"Pacifico"}
  }'
```

### Example 3: Custom font URL
```bash
curl -X POST http://localhost:3000/render \
  -d '{
    "components":[{"type":"text","text":{"spans":[{"fontFamily":"My Font","text":"Hello"}]}}],
    "dimensions":{"width":1000,"height":500},
    "fonts":{"My Font":"https://cdn.example.com/font.ttf"}
  }'
```

---

**You have complete font control!** 🎉

