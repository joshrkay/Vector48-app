"use client";

import { AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { VoiceMutationAction } from "@/lib/voice/types";

interface VoiceConfirmModalProps {
  action: VoiceMutationAction | null;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function formatActionLabel(action: VoiceMutationAction): string {
  switch (action.action) {
    case "recipe.activate":
      return `Activate recipe "${action.params.recipeSlug}"`;
    case "recipe.deactivate":
      return `Deactivate recipe "${action.params.recipeSlug}"`;
    case "crm.contact.create":
      return "Create contact";
    case "crm.contact.update":
      return `Update contact ${action.params.contactId}`;
    case "crm.contact.add_note":
      return `Add note to contact ${action.params.contactId}`;
    case "crm.conversation.send_message":
      return `Send message in conversation ${action.params.conversationId}`;
    case "crm.opportunity.create":
      return `Create opportunity for contact ${action.params.contactId}`;
    case "crm.opportunity.update":
      return `Update opportunity ${action.params.opportunityId}`;
    case "crm.opportunity.update_stage":
      return `Move opportunity ${action.params.opportunityId} to stage ${action.params.pipelineStageId}`;
    case "crm.opportunity.update_status":
      return `Mark opportunity ${action.params.opportunityId} as ${action.params.status}`;
    case "crm.appointment.create":
      return `Create appointment for contact ${action.params.contactId}`;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function VoiceConfirmModal({
  action,
  open,
  onCancel,
  onConfirm,
}: VoiceConfirmModalProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onCancel() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <AlertCircle className="mx-auto mb-2 text-amber-500" size={32} />
          <DialogTitle>Confirm Action</DialogTitle>
          <DialogDescription>
            {action
              ? formatActionLabel(action)
              : "Review the requested action before continuing."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            className="bg-[#00B4A6] text-white hover:bg-[#009e92]"
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
