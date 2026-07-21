import { Editor, Extension, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";

const ALLOWED_IMAGE_WIDTHS = new Set(["35", "50", "70", "100"]);
const ALLOWED_IMAGE_ALIGNMENTS = new Set(["left", "center", "right", "full"]);

const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (element) => element.style.fontSize || null,
          renderHTML: (attributes) => attributes.fontSize
            ? { style: `font-size: ${attributes.fontSize}` }
            : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (fontSize) => ({ chain }) => chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

const PositionedImage = Image.extend({
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: "center",
        parseHTML: (element) => element.dataset.align || "center",
        renderHTML: (attributes) => ({
          "data-align": ALLOWED_IMAGE_ALIGNMENTS.has(String(attributes.align)) ? attributes.align : "center",
        }),
      },
      width: {
        default: "70",
        parseHTML: (element) => element.dataset.width || "70",
        renderHTML: (attributes) => {
          const width = ALLOWED_IMAGE_WIDTHS.has(String(attributes.width)) ? String(attributes.width) : "70";
          return { "data-width": width, style: `width: ${width}%;` };
        },
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },
});

function setButtonState(root, editor) {
  root.querySelectorAll("[data-editor-command]").forEach((button) => {
    const command = button.dataset.editorCommand;
    const activeCommands = ["bold", "italic", "bulletList", "orderedList", "blockquote"];
    button.classList.toggle("active", activeCommands.includes(command) && editor.isActive(command));
  });

  const blockStyle = root.querySelector("[data-editor-block-style]");
  if (blockStyle) {
    blockStyle.value = editor.isActive("heading", { level: 2 })
      ? "heading-2"
      : editor.isActive("heading", { level: 3 })
        ? "heading-3"
        : "paragraph";
  }

  const imageControls = root.querySelector("[data-image-controls]");
  const imageSelected = editor.isActive("image");
  if (imageControls) imageControls.hidden = !imageSelected;
  if (!imageSelected) return;

  const attributes = editor.getAttributes("image");
  const selectedWidth = ALLOWED_IMAGE_WIDTHS.has(String(attributes.width)) ? String(attributes.width) : "70";
  root.querySelectorAll("[data-image-width-option]").forEach((button) => {
    button.classList.toggle("active", button.dataset.imageWidthOption === selectedWidth);
  });
  const alt = root.querySelector("[data-image-alt]");
  if (alt) alt.value = String(attributes.alt || "");
  root.querySelectorAll("[data-image-align]").forEach((button) => {
    button.classList.toggle("active", button.dataset.imageAlign === attributes.align);
  });
}

export function createAboutEditor({
  root,
  element,
  content,
  labels,
  uploadImage,
  onUploadState = () => {},
  onError = () => {},
}) {
  if (!root || !element) throw new Error("editor_mount_missing");

  const editor = new Editor({
    element,
    extensions: [
      StarterKit,
      TextStyle,
      FontSize,
      PositionedImage.configure({ inline: true, allowBase64: false }),
      Placeholder.configure({ placeholder: labels.placeholder }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "tiptap",
        spellcheck: "true",
        lang: "ro",
      },
    },
    onCreate: ({ editor: currentEditor }) => setButtonState(root, currentEditor),
    onSelectionUpdate: ({ editor: currentEditor }) => setButtonState(root, currentEditor),
    onTransaction: ({ editor: currentEditor }) => setButtonState(root, currentEditor),
  });

  root.querySelectorAll("[data-editor-command]").forEach((button) => {
    button.addEventListener("click", () => {
      const commands = {
        bold: () => editor.chain().focus().toggleBold().run(),
        italic: () => editor.chain().focus().toggleItalic().run(),
        bulletList: () => editor.chain().focus().toggleBulletList().run(),
        orderedList: () => editor.chain().focus().toggleOrderedList().run(),
        blockquote: () => editor.chain().focus().toggleBlockquote().run(),
        undo: () => editor.chain().focus().undo().run(),
        redo: () => editor.chain().focus().redo().run(),
      };
      commands[button.dataset.editorCommand]?.();
    });
  });

  root.querySelector("[data-editor-text-size]")?.addEventListener("change", (event) => {
    const size = event.currentTarget.value;
    if (size) editor.chain().focus().setFontSize(size).run();
    else editor.chain().focus().unsetFontSize().run();
  });

  root.querySelector("[data-editor-block-style]")?.addEventListener("change", (event) => {
    const style = event.currentTarget.value;
    if (style === "heading-2") editor.chain().focus().setHeading({ level: 2 }).run();
    else if (style === "heading-3") editor.chain().focus().setHeading({ level: 3 }).run();
    else editor.chain().focus().setParagraph().run();
  });

  const fileInput = root.querySelector("[data-inline-image-input]");
  fileInput?.addEventListener("change", async (event) => {
    const [file] = event.currentTarget.files || [];
    if (!file) return;
    event.currentTarget.value = "";
    onUploadState(true);
    try {
      const uploaded = await uploadImage(file);
      editor.chain().focus().insertContent([
        {
          type: "image",
          attrs: {
            src: uploaded.url,
            alt: uploaded.alt || file.name,
            title: uploaded.alt || file.name,
            align: "center",
            width: "70",
          },
        },
        { type: "text", text: " " },
      ]).run();
    } catch (error) {
      onError(error);
    } finally {
      onUploadState(false);
    }
  });

  root.querySelectorAll("[data-image-align]").forEach((button) => {
    button.addEventListener("click", () => {
      editor.chain().focus().updateAttributes("image", {
        align: ALLOWED_IMAGE_ALIGNMENTS.has(button.dataset.imageAlign)
          ? button.dataset.imageAlign
          : "center",
      }).run();
    });
  });

  root.querySelectorAll("[data-image-width-option]").forEach((button) => {
    button.addEventListener("click", () => {
      const width = ALLOWED_IMAGE_WIDTHS.has(button.dataset.imageWidthOption)
        ? button.dataset.imageWidthOption
        : "70";
      editor.chain().focus().updateAttributes("image", { width }).run();
    });
  });

  root.querySelector("[data-image-alt]")?.addEventListener("change", (event) => {
    const alt = event.currentTarget.value.trim();
    editor.chain().focus().updateAttributes("image", { alt, title: alt || null }).run();
  });

  root.querySelector("[data-image-remove]")?.addEventListener("click", () => {
    if (editor.isActive("image")) editor.chain().focus().deleteSelection().run();
  });

  return {
    getJSON: () => editor.getJSON(),
    destroy: () => editor.destroy(),
  };
}
