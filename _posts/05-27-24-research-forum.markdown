---
layout: post
title:  "Building ResearchForum: Research acceleration for research and labs"
date:   2024-05-27 02:52:17 -0700
categories: personal
---

## 1. Inspiration: The two modes of research consumption

I likely have a short attention span, and tend to spend way too much time on forum-based sites (i.e. hackernews, twitter, reddit). There is something about this format that lends itself to:
1. Efficiently compressed ideas
2. A constant sense of exploration
3. Variance in points of view

Working in research, reading research papers is a large part of my job. When I need to switch my attention from this forum content, to something like reading research papers, I find friction. Why? I think, partly, it is an attention issue. But I think there is something else, vaguely in the direction of productivity, driving this. 

If we think back to the big three reasons above why I like forum based content, these aren't strict vices. They help in quickly getting a compressed representation of many different points of view, and if the space is sufficiently large, hones your ability to explore graph based content. 

Some would say that this preference is a vice, as broad exploration runs counter to deeply understanding the material. But in practice, I find that these don't often tend to. If one needs a deep dive, they can simply do so. These approaches aren't mutually exclusive. But there are two distinct approaches: deep dives and broad exploration.

I don't find that the tooling is good enough for the "broad exploration" mode. If it were, I wouldn't have 50 papers on my personal backlog.

## 2. A better "broad exploration" mode

What setup would make me happy exploring content? 
1. All ideas are compressed.
2. I want to explore.
3. I want varying points of view.

I think Hackernews is the best example of this. Specifically, the comments are high variance and also of very high quality. Sadly, Hackernews is too broad of a venue. I would want something just related to my hyper-specific research area. And this is too niche of a forum to get popular. Also, people aren't going to publish their ideas in public, they are rather going to hide them and submit them to a journal.

If I am not going to find a forum, can I make one with LLMs? Ideally this is something that simulates HN-style users, each of which has intimate knowledge of all papers I have ever read. Here is roughly the idea:
- When I hear about a new paper, I upload it, and it is uploaded to an associative memory shared by all agents. A new post is generated with a summary and some HN-like discussion begins. The simulated users try to critique and unify ideas across their known papers to make the best possible comment.
- The agents that run, similar to me in real life, are left to their own devices. They aren't explicitly prompted, however are on a self-prompt loop, with no human input, thinking to themselves. When they formulate an idea, potentially across context windows spanning many forum-posts/papers, they can make a new post to the forum.
- Agents vote on posts and comments as they explore the forum.

I would then have a self-running flywheel of paper-summaries, critiques, and idea-generation. This solution would satisfy me, as it satisfies the 3 main objectives above.

## 3. I built a prototype

When I started, my intuition is that there was > 50% chance I could make something like this useful. After building the prototype, I now think that the odds are much higher. I thought hallucinations would be a big issue, but if you force the agents to cite sources from the associative memory of all papers, it cuts down on this issue significantly.

My intuition has also evolved onto what the core value-add technology is here. It is not simply a forum simulation with users, but it is a framework for knowledge backed graph exploration, aiming to maximally take advantage of in-context learning to produce new ideas. Essentially, the framework serves to squeeze the most possible creative juice out of LLMs, in a certain target area.

## 4.Taking a step back

In the limit, I think that humans won't be heavily involved in any sort of research. I think in a few hundred years AI systems will be so good that they will largely self direct it. But what do the steps down that road look like? I think the first step down that road largely looks like this concept, utilizing LLMs.

LLMs are good at doing things within their training set. When they get new tasks, they often fail. This seems to run counter to the goal of ResearchForum, but I don't think it actually does. 

*In-context learning exists. The idea is to use short bursts of in-context learning to make high-value posts and comments to accelerate research.*

## 4.1 Can this idea get trampled by improvements in the base GPT technology?

Some ideas get trampled quite easily by advances in base models. For example, paper summarizers were shot dead in the water after GPT4 was released with higher context windows. Other ideas benefit from architectural advances in the base model, as these advances act as a rising tide that will raise all boats for ventures not competing with the base model.

I do not think ResearchForum, competes with the base models. Certainly, any idea would get trampled by a general architectural advance (i.e. something not even GPT-based). But ResearchForum seems pretty robust against trampling. To see why, let's examine the three common avenues of GPT trampling:
1. Longer context windows
2. Better reasoning
3. Better tooling (i.e. multimodality)

If any of these happen, ResearchForum would actually get better. The value ResearchForum adds as a framework supporting multi-agent, vast vector-backed associative memory for papers, would remain and get better.

## 5. Potential business plan?

I think I am going to keep working on this. I am going to make it better, maximally useful to me, then try to market it to PhD students. I think there could be some money to be made here, and if the idea generation works well enough, it may even be wise to search for external funding, do a small amount of hiring, and pivot to something more aggressive.

For now I am going to focus on the research paper use case, but really this idea is also generalizable to other domains.
