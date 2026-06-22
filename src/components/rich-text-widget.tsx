import { useEffect, useRef, useState } from "react";
import { SlateContainer, EFormat, htmlToSlate, slateToHtml } from "@concord-consortium/slate-editor";

import "@concord-consortium/slate-editor/dist/index.css";
import "./rich-text-widget.css";

const kThemeColor = "#34a5be";

interface IRichTextProps {
  id: string;
  onBlur:  (id: string, value:string) => void;
  value: string;
}

function exportHtml(value: any) {
  const html = slateToHtml(value);
  // convert empty paragraph to empty string
  const emptyParagraphsRegex = /<p>\s*<\/p>/gi;
  const cleanedHTML = html.replace(emptyParagraphsRegex, "");
  return cleanedHTML;
}

export const RichTextWidget = (props: IRichTextProps) => {
  const { id, onBlur } = props;
  const [value, setValue] = useState(htmlToSlate(props.value || ""));
  const [changeCount, setChangeCount] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const kExtraHeight = 30;
  const kInitialHeight = 50;
  const [height, setHeight] = useState(kInitialHeight);


  const handleChange = (editorValue: any) => {
    setValue(editorValue);
    setChangeCount(count => count + 1);
  };

  const handleBlur = () => {
    onBlur(id, exportHtml(value));
  };

  // dynamically resize editor to fit content
  useEffect(() => {
    if (editorRef.current) {
      const currentHeight = editorRef.current.scrollHeight;
      const desiredHeight = currentHeight ? currentHeight + kExtraHeight : kInitialHeight;
      if (desiredHeight !== height) {
        setHeight(desiredHeight);
      }
    }
  }, [changeCount, value, height]);

  useEffect(() => {
    setValue(htmlToSlate(props.value || ""));
  }, [props.value]);

  return (
    <div className="customRichTextWidget">
      <SlateContainer
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        toolbar={{
          colors: {
            buttonColors: { fill: "#666666", background: "#FFFFFF" },
            selectedColors: { fill: "#FFFFFF", background: "#666666" },
            themeColor: kThemeColor
          },
          buttons: [
            EFormat.bold, EFormat.italic, EFormat.underlined, EFormat.deleted,
            EFormat.superscript, EFormat.subscript, EFormat.color,
            EFormat.image, EFormat.link,
            EFormat.heading1, EFormat.heading2, EFormat.heading3,
            EFormat.blockQuote, EFormat.numberedList, EFormat.bulletedList
          ],
          padding: 2
        }}
        editorClassName="customRichTextEditor"
      />
    </div>);
};