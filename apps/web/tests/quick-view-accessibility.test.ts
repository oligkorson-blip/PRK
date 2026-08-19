import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const modalPath = path.join(process.cwd(), "components/quick-view-modal.tsx");

describe("quick view accessibility", () => {
  it("keeps the modal focus trap stable when the parent rerenders", () => {
    const src = readFileSync(modalPath, "utf8");

    expect(src).toContain("const onCloseRef = useRef(onClose);");
    expect(src).toContain("onCloseRef.current = onClose;");
    expect(src).toContain("onCloseRef.current();");
    expect(src).toContain("  }, []);");
  });

  it("uses the visible opportunity name as the dialog label", () => {
    const src = readFileSync(modalPath, "utf8");

    expect(src).toContain("const titleId = useId();");
    expect(src).toContain("aria-labelledby={titleId}");
    expect(src).toContain('<h2 id={titleId} className="h3 quick-view-name">');
    expect(src).toContain("role=\"dialog\"");
  });
});
