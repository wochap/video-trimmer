import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { Field, Input } from "./field";
import { Kbd } from "./kbd";
import { Segmented } from "./segmented";
import { Tag } from "./tag";
describe("Button", () => {
  it.each([
    ["primary", "border-accent"],
    ["secondary", "border-divider"],
    ["ghost", "text-accent"],
  ] as const)("renders the %s variant", (variant, cls) => {
    render(<Button variant={variant}>Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toHaveClass(cls);
    expect(button).toHaveAttribute("type", "button");
  });
  it("renders a square icon button", () => {
    render(<Button size="icon" aria-label="Play" />);
    expect(screen.getByRole("button", { name: "Play" })).toHaveClass("size-9");
  });
  it("dims when disabled", () => {
    render(<Button disabled>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveClass(
      "disabled:opacity-45",
    );
  });
});
describe("Segmented", () => {
  const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
  ];
  it("exposes a labelled radio group and reports changes", async () => {
    const change = vi.fn();
    render(
      <Segmented label="Mode" value="a" options={options} onChange={change} />,
    );
    expect(screen.getByRole("radiogroup", { name: "Mode" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Alpha" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Beta" }));
    expect(change).toHaveBeenCalledWith("b");
  });
  it("disables every option", () => {
    render(
      <Segmented
        label="Mode"
        value="a"
        options={options}
        onChange={() => {}}
        disabled
      />,
    );
    for (const r of screen.getAllByRole("radio")) expect(r).toBeDisabled();
  });
});
describe("Tag, Field, Input, Kbd", () => {
  it("renders each primitive", () => {
    render(
      <>
        <Tag>h264</Tag>
        <Tag tone="accent">Pro</Tag>
        <Field label="Name" htmlFor="n">
          <Input id="n" defaultValue="clip" />
        </Field>
        <Kbd>Enter</Kbd>
      </>,
    );
    expect(screen.getByText("h264")).toHaveClass("bg-neutral-800");
    expect(screen.getByText("Pro")).toHaveClass("bg-accent-800");
    expect(screen.getByLabelText("Name")).toHaveValue("clip");
    expect(screen.getByText("Enter").tagName).toBe("KBD");
  });
});
