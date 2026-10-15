"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { NumberInput } from "@/components/ui/number-input";
import { showMutationToast } from "@/libs/toast";
import { defaultWarRules, warRulesSchema } from "@/validators/war";

/** Edit staff settings for future approvals; active wars retain their saved rules. */
export const WarRulesForm = () => {
  const [message, setMessage] = useState("");
  const { data } = api.war.getRules.useQuery();
  const utils = api.useUtils();
  const form = useForm<
    z.input<typeof warRulesSchema>,
    unknown,
    z.output<typeof warRulesSchema>
  >({
    defaultValues: defaultWarRules,
    resolver: zodResolver(warRulesSchema),
  });
  const mutation = api.war.setRules.useMutation({
    onSuccess: (result) => {
      setMessage(result.message);
      showMutationToast(result);
      if (result.success) void utils.war.getRules.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });
  useEffect(() => {
    if (data) form.reset(data);
  }, [data, form]);
  return (
    <section className="mt-6 border-t pt-4">
      <h3 className="text-lg font-semibold">Village war settings</h3>
      <p className="text-sm text-muted-foreground mb-3">
        Rules are frozen when elders approve a declaration. Existing wars keep their
        rules.
      </p>
      <Form {...form}>
        <form
          className="space-y-3"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <FormField
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={(event) => field.onChange(event.target.checked)}
                  />
                  Enable objective village wars
                </FormLabel>
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(defaultWarRules) as (keyof typeof defaultWarRules)[])
              .filter((key) => key !== "enabled")
              .map((key) => (
                <FormField
                  key={key}
                  control={form.control}
                  name={key}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">
                        {key
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (letter) => letter.toUpperCase())}
                      </FormLabel>
                      <FormControl>
                        <NumberInput
                          value={Number(field.value)}
                          onValueChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
          </div>
          {message && (
            <p role="status" className="text-sm">
              {message}
            </p>
          )}
          <Button disabled={mutation.isPending} type="submit">
            Save war settings
          </Button>
        </form>
      </Form>
    </section>
  );
};
