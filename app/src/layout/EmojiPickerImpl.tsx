"use client";

import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";

export const EmojiPickerImpl = (props: Record<string, unknown>) => (
  <Picker {...props} data={data} />
);
