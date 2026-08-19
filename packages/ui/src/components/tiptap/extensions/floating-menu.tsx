import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AudioLines,
  ChevronRight,
  Code2,
  CodeSquare,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  List,
  ListOrdered,
  Minus,
  Paperclip,
  Quote,
  Table2,
  Video,
} from "lucide-react";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { FloatingMenu } from "@tiptap/react/menus";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@sycom/ui/components/command";
import { cn } from "@sycom/ui/lib/utils";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type FloatingMenuCommand = {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  keywords: string;
  command: (editor: Editor) => void;
};

type FloatingMenuGroup = {
  group: string;
  items: FloatingMenuCommand[];
};

type SlashCommandState = {
  query: string;
  shouldShow: boolean;
  range: {
    from: number;
    to: number;
  } | null;
};

const commandGroups: FloatingMenuGroup[] = [
  {
    group: "Basic blocks",
    items: [
      {
        title: "Text",
        description: "Just start writing with plain text",
        icon: ChevronRight,
        keywords: "paragraph text",
        command: (editor) => editor.chain().focus().clearNodes().run(),
      },
      {
        title: "Heading 1",
        description: "Large section heading",
        icon: Heading1,
        keywords: "h1 title header",
        command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        title: "Heading 2",
        description: "Medium section heading",
        icon: Heading2,
        keywords: "h2 subtitle",
        command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        title: "Heading 3",
        description: "Small section heading",
        icon: Heading3,
        keywords: "h3 subheader",
        command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      {
        title: "Bullet List",
        description: "Create a simple bullet list",
        icon: List,
        keywords: "unordered ul bullets",
        command: (editor) => editor.chain().focus().toggleBulletList().run(),
      },
      {
        title: "Numbered List",
        description: "Create an ordered list",
        icon: ListOrdered,
        keywords: "numbered ol",
        command: (editor) => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        title: "Code Block",
        description: "Capture code snippets",
        icon: Code2,
        keywords: "code snippet pre",
        command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
      },
      {
        title: "Table",
        description: "Insert a 3x3 table (use the toolbar for custom sizes)",
        icon: Table2,
        keywords: "table grid rows columns spreadsheet",
        command: (editor) =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      },
      {
        title: "Horizontal Rule",
        description: "Add a horizontal divider",
        icon: Minus,
        keywords: "horizontal rule divider",
        command: (editor) => editor.chain().focus().setHorizontalRule().run(),
      },
    ],
  },
  {
    group: "Media",
    items: [
      {
        title: "Image",
        description: "Insert an image",
        icon: ImageIcon,
        keywords: "image picture photo",
        command: (editor) => editor.chain().focus().insertImagePlaceholder().run(),
      },
      {
        title: "Video",
        description: "Embed a video",
        icon: Video,
        keywords: "video movie clip mp4",
        command: (editor) => editor.chain().focus().insertVideoPlaceholder().run(),
      },
      {
        title: "Audio",
        description: "Embed an audio clip",
        icon: AudioLines,
        keywords: "audio sound voice mp3",
        command: (editor) => editor.chain().focus().insertAudioPlaceholder().run(),
      },
      {
        title: "File",
        description: "Attach a file",
        icon: Paperclip,
        keywords: "file attachment document pdf zip",
        command: (editor) => editor.chain().focus().insertFilePlaceholder().run(),
      },
    ],
  },
  {
    group: "Inline",
    items: [
      {
        title: "Quote",
        description: "Capture a quotation",
        icon: Quote,
        keywords: "blockquote cite quote",
        command: (editor) => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        title: "Code",
        description: "Inline code snippet",
        icon: CodeSquare,
        keywords: "code inline",
        command: (editor) => editor.chain().focus().toggleCode().run(),
      },
    ],
  },
  {
    group: "Alignment",
    items: [
      {
        title: "Align Left",
        description: "Align text to the left",
        icon: AlignLeft,
        keywords: "align left",
        command: (editor) => editor.chain().focus().setTextAlign("left").run(),
      },
      {
        title: "Align Center",
        description: "Center align text",
        icon: AlignCenter,
        keywords: "align center",
        command: (editor) => editor.chain().focus().setTextAlign("center").run(),
      },
      {
        title: "Align Right",
        description: "Align text to the right",
        icon: AlignRight,
        keywords: "align right",
        command: (editor) => editor.chain().focus().setTextAlign("right").run(),
      },
    ],
  },
];

function getSlashCommandState(editor: Editor): SlashCommandState {
  const { state } = editor;
  const { $from, from } = state.selection;
  const currentLineText = $from.parent.textBetween(0, $from.parentOffset, "\n", " ");
  const isSlashCommand =
    currentLineText.startsWith("/") &&
    $from.parent.type.name !== "codeBlock" &&
    $from.parentOffset === currentLineText.length;

  if (!isSlashCommand) {
    return {
      query: "",
      shouldShow: false,
      range: null,
    };
  }

  return {
    query: currentLineText.slice(1).trim(),
    shouldShow: true,
    range: {
      from: Math.max(0, from - currentLineText.length),
      to: from,
    },
  };
}

function getEditorElement(editor: Editor): Element | null {
  const { element } = editor.options;

  if (element instanceof Element) {
    return element;
  }

  if (typeof element === "object" && element?.mount instanceof HTMLElement) {
    return element.mount;
  }

  return null;
}

function isSameSlashCommandState(left: SlashCommandState, right: SlashCommandState): boolean {
  return (
    left.query === right.query &&
    left.shouldShow === right.shouldShow &&
    left.range?.from === right.range?.from &&
    left.range?.to === right.range?.to
  );
}

function getNextIndex(currentIndex: number, itemCount: number, direction: "up" | "down"): number {
  if (itemCount === 0) {
    return -1;
  }

  if (currentIndex < 0) {
    return direction === "down" ? 0 : itemCount - 1;
  }

  if (direction === "down") {
    return currentIndex < itemCount - 1 ? currentIndex + 1 : 0;
  }

  return currentIndex > 0 ? currentIndex - 1 : itemCount - 1;
}

export function TipTapFloatingMenu({ editor }: { editor: Editor }) {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [slashCommandState, setSlashCommandState] = useState(() => getSlashCommandState(editor));
  const slashCommandStateRef = useRef(slashCommandState);
  const selectedIndexRef = useRef(selectedIndex);

  selectedIndexRef.current = selectedIndex;

  const syncSlashCommandState = useCallback((currentEditor: Editor) => {
    const nextState = getSlashCommandState(currentEditor);
    const previousState = slashCommandStateRef.current;

    slashCommandStateRef.current = nextState;

    if (previousState.query !== nextState.query || !nextState.shouldShow) {
      selectedIndexRef.current = -1;
      setSelectedIndex(-1);
    }

    setSlashCommandState((currentState) =>
      isSameSlashCommandState(currentState, nextState) ? currentState : nextState,
    );
  }, []);

  const filteredGroups = useMemo(() => {
    const normalizedQuery = slashCommandState.query.toLowerCase();

    return commandGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (!normalizedQuery) {
            return true;
          }

          return [item.title, item.description, item.keywords].some((value) =>
            value.toLowerCase().includes(normalizedQuery),
          );
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [slashCommandState.query]);

  const indexedGroups = useMemo(() => {
    let flatIndex = 0;

    return filteredGroups.map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        flatIndex: flatIndex++,
      })),
    }));
  }, [filteredGroups]);

  const flatFilteredItems = useMemo(
    () => indexedGroups.flatMap((group) => group.items),
    [indexedGroups],
  );

  const executeCommand = useCallback(
    (command: (editor: Editor) => void) => {
      const currentSlashCommandState = getSlashCommandState(editor);

      if (!currentSlashCommandState.range) {
        return;
      }

      editor.chain().focus().deleteRange(currentSlashCommandState.range).run();
      command(editor);
      // Deleting the slash text leaves an empty paragraph, so inserting an atom
      // block (e.g. a question) lands it node-selected. A focused, node-selected
      // atom steals focus from its own node-view inputs — you can't type in the
      // prompt. Collapsing to a text cursor after the node releases that grip.
      const { selection } = editor.state;
      if (selection instanceof NodeSelection) {
        editor.commands.setTextSelection(selection.to);
      }
      syncSlashCommandState(editor);
      selectedIndexRef.current = -1;
      setSelectedIndex(-1);
    },
    [editor, syncSlashCommandState],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!slashCommandStateRef.current.shouldShow || flatFilteredItems.length === 0) {
        return;
      }

      const preventDefault = () => {
        event.preventDefault();
        event.stopImmediatePropagation();
      };

      switch (event.key) {
        case "ArrowDown":
          preventDefault();
          setSelectedIndex((currentIndex) => {
            const nextIndex = getNextIndex(currentIndex, flatFilteredItems.length, "down");
            selectedIndexRef.current = nextIndex;
            return nextIndex;
          });
          break;

        case "ArrowUp":
          preventDefault();
          setSelectedIndex((currentIndex) => {
            const nextIndex = getNextIndex(currentIndex, flatFilteredItems.length, "up");
            selectedIndexRef.current = nextIndex;
            return nextIndex;
          });
          break;

        case "Enter": {
          preventDefault();
          const targetIndex = selectedIndexRef.current < 0 ? 0 : selectedIndexRef.current;
          const selectedItem = flatFilteredItems[targetIndex];

          if (selectedItem) {
            executeCommand(selectedItem.command);
          }
          break;
        }

        case "Escape":
          preventDefault();
          selectedIndexRef.current = -1;
          setSelectedIndex(-1);
          break;
      }
    },
    [executeCommand, flatFilteredItems],
  );

  useEffect(() => {
    syncSlashCommandState(editor);

    const handleEditorStateChange = () => syncSlashCommandState(editor);
    const editorElement = getEditorElement(editor);

    editor.on("transaction", handleEditorStateChange);
    editor.on("selectionUpdate", handleEditorStateChange);

    if (!editorElement) {
      return () => {
        editor.off("transaction", handleEditorStateChange);
        editor.off("selectionUpdate", handleEditorStateChange);
      };
    }

    const handleEditorKeyDown = (event: Event) => handleKeyDown(event as KeyboardEvent);

    editorElement.addEventListener("keydown", handleEditorKeyDown, true);

    return () => {
      editor.off("transaction", handleEditorStateChange);
      editor.off("selectionUpdate", handleEditorStateChange);
      editorElement.removeEventListener("keydown", handleEditorKeyDown, true);
    };
  }, [editor, handleKeyDown, syncSlashCommandState]);

  useEffect(() => {
    const selectedItem = selectedIndex >= 0 ? itemRefs.current[selectedIndex] : null;
    selectedItem?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <FloatingMenu
      editor={editor}
      shouldShow={({ editor: currentEditor }) => getSlashCommandState(currentEditor).shouldShow}
      options={{
        placement: "bottom-start",
      }}
    >
      <div className="z-50 w-72 overflow-hidden rounded-xl border border-border/80 bg-popover/95 shadow-lg ring-1 shadow-black/5 ring-black/5 backdrop-blur-md dark:bg-popover/90 dark:shadow-black/25 dark:ring-white/10">
        <Command>
          <CommandList className="max-h-[330px]">
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
              No results found
            </CommandEmpty>

            {indexedGroups.map((group) => (
              <CommandGroup key={group.group}>
                <CommandGroupLabel>{group.group}</CommandGroupLabel>
                {group.items.map((item) => (
                  <CommandItem
                    role="option"
                    key={`${group.group}-${item.title}`}
                    value={`${group.group} ${item.title} ${item.description} ${item.keywords}`}
                    onSelect={() => executeCommand(item.command)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => executeCommand(item.command)}
                    className={cn(
                      "gap-3 rounded-md px-2 py-2 aria-selected:bg-accent aria-selected:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground",
                      item.flatIndex === selectedIndex && "bg-accent text-accent-foreground",
                    )}
                    aria-selected={item.flatIndex === selectedIndex}
                    ref={(element) => {
                      itemRefs.current[item.flatIndex] = element;
                    }}
                    tabIndex={item.flatIndex === selectedIndex ? 0 : -1}
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-md border bg-background text-foreground",
                        item.flatIndex === selectedIndex && "border-transparent",
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div className="flex flex-1 flex-col">
                      <span className="text-sm font-medium">{item.title}</span>
                      <span className="text-xs text-muted-foreground">{item.description}</span>
                    </div>
                    <CommandShortcut>↵</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </div>
    </FloatingMenu>
  );
}
