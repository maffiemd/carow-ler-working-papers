---
layout: page
title: Editorial Board
permalink: /editorial-board/
---

## Editors

{% for person in site.editors %}
- **{{ person.name }}** — {{ person.affiliation }}
{% endfor %}

## Editorial Board

{% for person in site.editorial_board %}
- **{{ person.name }}** — {{ person.affiliation }}
{% endfor %}
