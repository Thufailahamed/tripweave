import { defineAction } from "@openuidev/lang-core";
import { z } from "zod";
import { planningAnswerSchema, refIdSchema } from "./questions";

/**
 * Every interaction a generated interface may trigger. Components emit these through
 * `useTriggerAction`; the host maps each one to a fixed, typed operation. There is deliberately no
 * generic open_url, fetch, query or mutation action.
 */
export const applyClarificationAction = defineAction({
  name: "apply_clarification",
  description: "Submit answers to the currently open clarification questions.",
  params: z.object({
    answers: z.array(planningAnswerSchema).min(1).max(20),
  }),
});

export const openPackagesAction = defineAction({
  name: "open_packages",
  description: "Open the standard package comparison page for this trip.",
  params: z.object({}),
});

export const openItineraryAction = defineAction({
  name: "open_itinerary",
  description: "Open the standard itinerary editor for this trip.",
  params: z.object({}),
});

export const openOptimiseAction = defineAction({
  name: "open_optimise",
  description: "Open the standard optimisation configuration page for this trip.",
  params: z.object({}),
});

export const openQuoteAction = defineAction({
  name: "open_quote",
  description: "Open an existing quotation by its ID from CONTEXT.",
  params: z.object({ quoteId: refIdSchema }),
});

export const planningActions = [applyClarificationAction, openPackagesAction, openItineraryAction, openOptimiseAction, openQuoteAction];
