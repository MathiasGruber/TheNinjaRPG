"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { api } from "@/app/_trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  STORE_BUNDLE_MAX_ITEMS,
  STORE_BUNDLE_MAX_PRICE_CENTS,
  STORE_BUNDLE_MAX_QUANTITY,
  STORE_BUNDLE_MAX_RYO,
  STORE_BUNDLE_MIN_PRICE_CENTS,
  WEB_REP_MAX,
} from "@/drizzle/constants";
import BanInfo from "@/layout/BanInfo";
import Loader from "@/layout/Loader";
import UserSearchSelect from "@/layout/UserSearchSelect";
import { canManageStore } from "@/utils/permissions";
import { useRequiredUserData } from "@/utils/UserContext";
import { type StoreBundleInput, storeBundleSchema } from "@/validators/points";
import { getSearchValidator } from "@/validators/register";
import { StoreCheckout } from "./StoreCheckout";

/** The public catalog and owner editor share the same validated offer payload. */
export function StoreBundles() {
  const { data: user } = useRequiredUserData();
  const canManage = canManageStore(user?.role);
  const query = api.paypal.getStoreBundles.useQuery({ includeInactive: canManage });
  const [selected, setSelected] = useState<string>();
  const [editing, setEditing] = useState<{ id?: string; data: StoreBundleInput }>();
  const [message, setMessage] = useState<string>();
  const userSearchSchema = getSearchValidator({ max: 1 });
  const methods = useForm<z.infer<typeof userSearchSchema>>({
    defaultValues: { username: "", users: [] },
    resolver: zodResolver(userSearchSchema),
  });
  const users = useWatch({ control: methods.control, name: "users", defaultValue: [] });
  useEffect(() => {
    if (user && users.length === 0) methods.setValue("users", [user]);
  }, [user, users, methods]);
  const save = api.paypal.saveStoreBundle.useMutation({
    onSuccess: async (result) => {
      setMessage(result.message);
      if (result.success) {
        setEditing(undefined);
        await query.refetch();
      }
    },
    onError: (error) => setMessage(error.message),
  });
  const offer = query.data?.bundles.find(
    (bundle) => bundle.id === selected && bundle.isActive,
  );
  const setDraft = (patch: Partial<StoreBundleInput>) =>
    setEditing((current) =>
      current ? { ...current, data: { ...current.data, ...patch } } : current,
    );
  const setContents = (patch: Partial<StoreBundleInput["contents"]>) => {
    if (editing) setDraft({ contents: { ...editing.data.contents, ...patch } });
  };
  if (user?.isBanned) return <BanInfo />;
  if (query.isPending) return <Loader explanation="Loading store bundles" />;
  if (query.isError)
    return (
      <p role="alert">
        Could not load bundles.{" "}
        <Button onClick={() => void query.refetch()}>Retry</Button>
      </p>
    );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Browse reputation packs and bundles with guaranteed in-game contents.
        </p>
        {canManage && (
          <Button
            onClick={() => {
              setMessage(undefined);
              setEditing({
                data: {
                  name: "",
                  description: "",
                  priceCents: STORE_BUNDLE_MIN_PRICE_CENTS,
                  isActive: false,
                  contents: { reputationPoints: 0, money: 0, items: [] },
                },
              });
            }}
          >
            Create bundle
          </Button>
        )}
      </div>
      {message && (
        <p role="status" className="rounded border p-3">
          {message}
        </p>
      )}
      {canManage && editing && (
        <Card>
          <CardHeader>
            <CardTitle>{editing.id ? "Edit bundle" : "Create bundle"}</CardTitle>
            <CardDescription>
              Set a price in USD and guaranteed contents. Publish when the offer is
              ready.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const parsed = storeBundleSchema.safeParse(editing.data);
                if (!parsed.success) {
                  setMessage(
                    parsed.error.issues.map((issue) => issue.message).join(". "),
                  );
                  return;
                }
                save.mutate({ id: editing.id, data: parsed.data });
              }}
            >
              <fieldset disabled={save.isPending} className="space-y-4">
                <label className="block" htmlFor="bundle-name">
                  Bundle name
                  <Input
                    id="bundle-name"
                    value={editing.data.name}
                    onChange={(event) => setDraft({ name: event.target.value })}
                    required
                    maxLength={100}
                  />
                </label>
                <label className="block" htmlFor="bundle-description">
                  Description
                  <Textarea
                    id="bundle-description"
                    value={editing.data.description}
                    onChange={(event) => setDraft({ description: event.target.value })}
                    maxLength={1000}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label htmlFor="bundle-price">
                    Price (USD)
                    <NumberInput
                      id="bundle-price"
                      min={STORE_BUNDLE_MIN_PRICE_CENTS / 100}
                      max={STORE_BUNDLE_MAX_PRICE_CENTS / 100}
                      step="0.01"
                      value={editing.data.priceCents / 100}
                      onValueChange={(value) =>
                        setDraft({ priceCents: Math.round(value * 100) })
                      }
                      required
                    />
                  </label>
                  <label htmlFor="bundle-reputation">
                    Reputation points
                    <NumberInput
                      id="bundle-reputation"
                      min={0}
                      max={WEB_REP_MAX}
                      step={1}
                      value={editing.data.contents.reputationPoints}
                      onValueChange={(value) =>
                        setContents({ reputationPoints: value })
                      }
                      required
                    />
                  </label>
                  <label htmlFor="bundle-ryo">
                    Ryo
                    <NumberInput
                      id="bundle-ryo"
                      min={0}
                      max={STORE_BUNDLE_MAX_RYO}
                      step={1}
                      value={editing.data.contents.money}
                      onValueChange={(value) => setContents({ money: value })}
                      required
                    />
                  </label>
                </div>
                <div className="space-y-2">
                  <p className="font-semibold text-sm">Items</p>
                  {editing.data.contents.items.map((reward, index) => (
                    <div key={index} className="flex gap-2">
                      <Select
                        value={reward.id}
                        onValueChange={(id) =>
                          setContents({
                            items: editing.data.contents.items.map((current, i) =>
                              i === index ? { ...current, id } : current,
                            ),
                          })
                        }
                      >
                        <SelectTrigger aria-label={`Item ${index + 1}`}>
                          <SelectValue placeholder="Choose an item" />
                        </SelectTrigger>
                        <SelectContent>
                          {query.data?.items.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <NumberInput
                        className="w-24"
                        aria-label={`Item ${index + 1} quantity`}
                        min={1}
                        max={STORE_BUNDLE_MAX_QUANTITY}
                        step={1}
                        value={reward.quantity}
                        onValueChange={(value) =>
                          setContents({
                            items: editing.data.contents.items.map((current, i) =>
                              i === index ? { ...current, quantity: value } : current,
                            ),
                          })
                        }
                        required
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setContents({
                            items: editing.data.contents.items.filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      editing.data.contents.items.length >= STORE_BUNDLE_MAX_ITEMS
                    }
                    onClick={() =>
                      setContents({
                        items: [
                          ...editing.data.contents.items,
                          { id: "", quantity: 1 },
                        ],
                      })
                    }
                  >
                    Add item
                  </Button>
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editing.data.isActive}
                    onChange={(event) => setDraft({ isActive: event.target.checked })}
                  />
                  Published in store
                </label>
                <div className="flex gap-2">
                  <Button type="submit">
                    {save.isPending ? "Saving…" : "Save bundle"}
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setEditing(undefined)}
                  >
                    Cancel
                  </Button>
                </div>
              </fieldset>
            </form>
          </CardContent>
        </Card>
      )}
      {!query.data?.bundles.length && (
        <p className="rounded border border-dashed p-6 text-center text-muted-foreground">
          No bundles are available yet. You can still choose a custom amount in
          Reputation.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {query.data?.bundles.map((bundle) => (
          <Card
            key={bundle.id}
            className={
              selected === bundle.id ? "border-primary ring-1 ring-primary" : ""
            }
          >
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{bundle.name}</CardTitle>
                {!bundle.isActive && <Badge variant="secondary">Hidden</Badge>}
              </div>
              <CardDescription>{bundle.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-1 text-sm">
                {bundle.contents.reputationPoints > 0 && (
                  <li>
                    {bundle.contents.reputationPoints.toLocaleString()} reputation
                    points
                  </li>
                )}
                {bundle.contents.money > 0 && (
                  <li>{bundle.contents.money.toLocaleString()} ryo</li>
                )}
                {bundle.contents.items.map((reward) => (
                  <li key={reward.id}>
                    {reward.quantity} ×{" "}
                    {query.data?.items.find((item) => item.id === reward.id)?.name ??
                      "Unavailable item"}
                  </li>
                ))}
              </ul>
              <p className="font-bold text-2xl">
                ${(bundle.priceCents / 100).toFixed(2)}{" "}
                <span className="font-normal text-sm">USD</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!bundle.isActive}
                  variant={selected === bundle.id ? "default" : "outline"}
                  onClick={() => setSelected(bundle.id)}
                >
                  {selected === bundle.id ? "Selected" : "Select bundle"}
                </Button>
                {canManage && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMessage(undefined);
                      setEditing({
                        id: bundle.id,
                        data: {
                          name: bundle.name,
                          description: bundle.description,
                          priceCents: bundle.priceCents,
                          isActive: bundle.isActive,
                          contents: bundle.contents,
                        },
                      });
                    }}
                  >
                    Edit
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {offer && (
        <Card>
          <CardHeader>
            <CardTitle>Purchase {offer.name}</CardTitle>
            <CardDescription>
              All listed contents go to the selected player. Reputation counts toward
              your monthly allowance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <UserSearchSelect
              useFormMethods={methods}
              showYourself
              showAi={false}
              inline
              maxUsers={1}
            />
            <p className="font-semibold">
              Total: ${(offer.priceCents / 100).toFixed(2)} USD
            </p>
            <StoreCheckout
              selection={{ type: "bundle", bundleId: offer.id }}
              recipientId={users[0]?.userId}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
