---
layout: post
title:  "I expected the GPT summarizers to be better..."
date:   2023-08-13 11:44:17 -0700
categories: personal
---

## Goal

I want a tool to summarize research papers to get a high level overview without investing a lot of time in each paper. This will help me invest time in reading the papers that actually matter.

## SOTA


The state of the art is stuff like this:
https://www.intellippt.com/

I am not a fan. First of all, you need to pay for it, and I feel exploited by that even if it isn't fair. Secondly, the summary it gives you back is not good. I think this can be done a lot better.

## What I want

I want something that segments the text into sections that I can match with the paper. Ideally these would be the numbered sections defined by the paper itself. Then I want a summary to be done for each of these sections with various prompting strategies, self reflection, etc.

Something like this could be done with GPT3.5, and would be cheap. 

I've actually tried to make this, but text segmentation is the hard part. GPT3.5 gets confused by all sorts of unexpected things and fails to segment text efficiently. GPT4 actually works very well, but is too expensive. Options I am exploring right now are a word2vec based solution and another based on [rupture](https://github.com/deepcharles/ruptures).
