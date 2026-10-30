# CAC Hymns JSON

A structured JSON collection of Christ Apostolic Church (CAC) hymns in English and Yoruba.

This repository makes the hymn data easier for developers to use in applications such as church presentation software, hymn apps, worship applications, and other church-related projects.

## 📚 Available Datasets

| Dataset | File                    |
| ------- | ----------------------- |
| English | `data/cac_english.json` |
| Yoruba  | `data/cac_yoruba.json`  |

## 📦 JSON Structure

Each hymn follows a simple, consistent structure:

```json
{
  "id": "1150",
  "number": "V050",
  "metadata": "Ife gbogbo orilede yoo si de - Hag. 2:7",
  "category": "",
  "lyrics": "1. Gbo orin awon Angeli..."
}
```

### Fields

| Field      | Type   | Description                                   |
| ---------- | ------ | --------------------------------------------- |
| `id`       | string | Unique identifier for the hymn                |
| `number`   | string | Hymn number/reference                         |
| `metadata` | string | Additional information or scripture reference |
| `category` | string | Hymn category                                 |
| `lyrics`   | string | Complete hymn lyrics                          |

The `lyrics` field contains the complete text of the hymn, including numbered verses and any chorus or ending text included in the source data.

See [`schema.json`](schema.json) for the expected structure.

## 🚀 Using the Data

You can download the JSON files directly from this repository and load them into your application.

### English

```text
https://raw.githubusercontent.com/WITTY-T/cac-hymns-json/main/data/cac_english.json
```

### Yoruba

```text
https://raw.githubusercontent.com/WITTY-T/cac-hymns-json/main/data/cac_yoruba.json
```

### JavaScript

```js
const response = await fetch(
  "https://raw.githubusercontent.com/WITTY-T/cac-hymns-json/main/data/cac_english.json"
);

const hymns = await response.json();

console.log(hymns);
```

### Find a Hymn

```js
const hymn = hymns.find(
  (hymn) => hymn.number === "V050"
);

console.log(hymn);
```

## 🌍 Languages

This repository currently contains:

* 🇬🇧 English hymns
* 🇳🇬 Yoruba hymns

More datasets may be added in the future.

## 📌 Version

**Current version: v1.0.0**

See the [Releases](../../releases) page for previous and future versions.

## ⚠️ Attribution and Rights

The hymn texts contained in these datasets may be subject to copyright or other rights held by their respective authors, publishers, churches, and/or other rights holders.

This repository does not claim ownership of the original hymn texts.

The data is provided in a structured format for developers and projects that have the appropriate rights or permission to use the material.

Please verify the copyright and usage requirements applicable to the hymns before redistributing them or using them in a commercial application.

Where applicable, retain the original attribution and source information contained in the dataset.

## 🤝 Contributing

Contributions that improve the structure, consistency, documentation, or technical quality of the dataset are welcome.

Please do not submit copyrighted material unless you have the right or permission to redistribute it.

## 📄 License

The hymn text itself is **not automatically licensed under the repository's software license** and remains subject to the rights of its respective copyright holders.

The repository's original documentation and schema are provided for use with the dataset, subject to the terms stated in the repository.

## ⭐ Support

If you find this dataset useful, consider giving the repository a ⭐ on GitHub.

---

Built by [WITTY-T](https://github.com/WITTY-T)
