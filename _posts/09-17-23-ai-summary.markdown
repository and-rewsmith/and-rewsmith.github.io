---
layout: post
title:  "Thoughts on LLMs, foundation models, and the future"
date:   2023-09-17 02:52:17 -0700
categories: personal
---

## 1: Where we are at now for generative language models?

Currently what works best is a transformer backed foundation model, instruction tuned, and RLHF'd to [mask](https://pbs.twimg.com/media/FtijcL9agAAFI9S.jpg) its undesirable behaviors.

Transformers use backpropagation, which incurs high power usage, a limited context window, yet pretty good performance. Admittedly, the context window problem may be solvable with some clever tricks.

The next phase of development, to be further developed over the next few years, is Type II Reasoning systems (like autoGPT, babyAGI, etc.). These Type II Reasoning Systems will embed the model within a framework that provides memory, agency, etc.

Then after Type II Reasoning, comes other grandiose ideas being proposed like embodiment and distributed agent interactions. I do think these will happen though, and at some arbitrary point the consensus will finally be that we have reached "AGI". But I am sure the goalpost will move many times in the coming future.

So in that concept, the hierarchical structure I imagine looks like this (from inner to outer):
```
=============Base Language Model=============
Foundation Model

Instruction Tuning

RLHF
=============\Base Language Model=============

=============Prompt Engineering=============
Chain of thought (CoT) reasoning

Self reflection

Tree of thoughts
=============\Prompt Engineering=============

=============Type II Reasoning=============
Memory

Self prompting

Planning (sub)goals
=============\Type II Reasoning=============

=============Embodiment=============
Sensory input

Interaction with the real world
=============\Embodiment=============

=============Distributed Agent Interactions=============
Distributed weight updates

Agent hierarchy design

AI corporations
=============\Distributed Agent Interactions=============
```

## 2: What is so interesting about language models?

They are cool for these reasons:
1. Emergent properties
2. Use of tools
3. RLHF can shape their behavior
4. These models will run on resource constrained devices
5. Output text is blending the lines between output and the latent state

Language models are well formed as an autoregressive structure. They predict future inputs based on the past. It turns out scaled next token prediction with transformers works pretty well at giving agents a detailed world model. That alone is pretty cool.

But there also seems to be [emergent properties](https://arxiv.org/pdf/2206.07682.pdf) eminating at predictable thresholds.

> "Oh, but these language models are so bad at math."

OpenAI has made some really good changes and idk if this is really true anymore. Even still, one of the emergent properties from LLMs is the ability to decide and act to [use a given tool](https://arxiv.org/abs/2305.16291). That means the language model is able to shortcut a lot of its limitations.

There is also a beauty in the way that a foundation model can be RLHF'd to be a specialized tool, giving the possibility of a very powerful model for minimal training costs.

> "Oh, but these things still don't perform well on benchmarks and Sam Altman said the models will stop getting bigger."

Firstly, I don't think that OpenAI knows the full extent of what they release. The current benchmark numbers don't capture approaches like tree-of-thoughts which are shown to [significantly boost MMLU benches](https://www.youtube.com/watch?v=wVzuvf9D9BU).

The models right now are already sufficiently big. The current size is able to efficiently capture [way way more data](https://lifearchitect.ai/chinchilla/) than these models are currently being trained with.

The models should continue to get better, provided we can come up with new valuable tokens for training. At the same time, the model will get smaller, enabling phone LLMs and other resource constrained devices.

Lastly, it is interesting to view that the [computation space and the input space are totally mixed](https://twitter.com/karpathy/status/1529288843207184384) with the current LLM implementation. That is fascinating, something not seen with non-language data, and __allows__ the Type II Reasoning systems to be built.


## 3: Focusing on what is next: Type II Reasoning

It will be interesting to see how fast we can get past this next step.

The system people are converging on right now seems to be:
```
Framework = Type II Reasoning framework
next_prompt = INITIAL_PROMPT
loop {
    prompt LLM with next_prompt

    LLM creates tree of thoughts with self reflection and CoT

    output_text = LLM outputs text

    # Structure of output_text:
    # [Goals, subgoals, next query on memory, tools to use, observations, \
    # thoughts it wants to record in the output computation space]

    Framework runs commands on tools

    next_prompt = Framework generates next prompt for LLM

    # Structure of next_prompt:
    # [Goals, subgoals, memory query result, tool use result]
}

```

It is my personal opinion that the catastrophic forgetting problem could be something that is a lot less endemic with LLMs. And I think this because of this Type II Reasoning framework. Language data seems uniquely suited to this self prompting mechanism driving this loop.

It is the foundation language model that knows the fundamentals of the outside world, and the framework surrounding it, can serve to give the agent robust memory and goal planning such that it won't forget what it has "learned". The foundation model serves as an unchanging world model, which cannot forget, and provides the ability to interface with a framework to give the ability to effectively learn, remember, and plan.

## 4: An alternative view: Foundation Models

I am wondering if the optimal foundation model is really done with backprop. It seems to incur some significant tradeoffs to obtain training efficiency and tractability:
1. Dense activations, precluding low power approaches
2. Recurrent connections aren't effective due to BPTT
3. Cannot perform online learning (network forward and backward locks)
4. Every network subcomponent has to be differentiable

However, backprop __does__ provide the ability to perform distributed learning through communicating gradients in an environment of distributed networks all learning together. As we move forward in the sequence I laid out in section 1, I do think that this will play a huge benefit.

The tradeoffs backprop incurs seem to be pretty large though. It will limit any incentive toward power efficient, sparse activating, non-differentiable, and more biologically similar architectures. It will be interesting to see which approach will ultimately work better. For now, transformers are no doubt king.

## 5: An alternative view: Type II Reasoning and E2E systems

The Type II Reasoning architecture I laid out has too many handcoded features for it to be considered "perfect" imo. 

I really recommend reading [this](http://www.incompleteideas.net/IncIdeas/BitterLesson.html). It explains how approaches that bias away from leveraging the advances in computing will fail, relative to an approach that is built without hand coded features, and entirely relies on leveraging the computational advances in a simple end-to-end environment.

In this spirit, the Type II Reasoning system I laid out is not perfect. I think once we see the first few iterations of these that work, there will be a lot of research and work done to move the thoughts, goals, subgoals, memories back into the latent space rather than the input/output space. Then the network will be an end-to-end system, capable of being trained together and propogating gradients across the architecture.

## 6: AI safety

One of the benefits of the current way we are doing things, from an AI-safety perspective, is that the LLMs thoughts are all in a completely interpretable space. That at least gives our future selves the benefit of seeing exactly what these agents are thinking. 

We should probably not give this up if we move towards an E2E approach. I believe there should always be a way to interpret what the agents are thinking, even if we do the efficient thing and push more computation into the latent space.

These systems will eventually get to be powerful, and although alignment is hard, I am hopeful that RLHF can do a good enough job at aligning the models to humanities best interest (at least in my lifetime). Beyond that, I get the feeling we are making humanity's successor.