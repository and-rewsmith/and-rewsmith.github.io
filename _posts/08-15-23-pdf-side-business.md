---
layout: post
title:  "POC: Research paper summarizer"
date:   2023-08-15 22:52:17 -0700
categories: side-business
---

## Update on the POC
I hacked together a GPT summarizer over the last few weeks targeted at research papers. I wrote about this problem [here](https://and-rewsmith.github.io/personal/2023/08/13/pdf-summarizer.html).

## Motivation
The motivation is that gpt tools exist to "talk to" a  PDF. But this is not what a large subset of people want. They want to use GPTs to get a summary. The tool I made abstracts that away. Here is my POC.

The moat around this tool I expect to be short lived, but it will be there long enough to make money. The implementation was straightforward, but not totally so. Competitors would need to figure out how to use ML to segment text (cannot use openai for this due to increased cost and efficacy), and figure out how to prompt engineer the right style of summaries.

## Collaborate?
The business model will be:
- Users sign up via SSO.
- Users get first few PDFs free.Have to pay for all the rest.
- Subscription seems a bit hard to do. I think we would just charge 10$ increments and store user balance for future use.

Maybe someone may want to make a deal to get something in return for covering upfront costs. If it gets a lot of traffic, the site will be eating costs (server + openai api $$$). But theoretically this is a good thing because it is an influx of users to convert to subscription.

OpenAI price of summarizing a PDF is, I believe, far less than a dollar, which was my target. I can calculate this but would guess somewhere around 40 cents.

Here are the next steps:
```
LLC

Stripe integration

Accounts / SSO tracking

Table of contents view

Safety rate limitations:
- ip based
- length of pdf
- ...

Kubernetes setup- n agent cluster horizontally scaled

external web Database (i.e. mssql)

pay for server costs and openai costs

metrics
- api calls to us
- api calls to openai
- api failures (per node)- api successes (per node)```
