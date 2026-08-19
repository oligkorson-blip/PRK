type CiteProps = {
  source: string;
  url: string;
  asOf: string;
};

export function Cite({ source, url, asOf }: CiteProps) {
  return (
    <sup className="cite">
      <a href={url} target="_blank" rel="noopener noreferrer" title={`${source} · as of ${asOf}`}>
        [{source.split("—")[0]?.trim() || source}]
      </a>
    </sup>
  );
}
