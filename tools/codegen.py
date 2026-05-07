#!/usr/bin/env python3
"""Code generator using NVIDIA API with Qwen3-Coder-480B."""
import sys
import argparse
from openai import OpenAI

NVIDIA_API_KEY = "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"
BASE_URL = "https://integrate.api.nvidia.com/v1"
MODEL = "qwen/qwen3-coder-480b-a35b-instruct"


def generate(prompt: str, output_file: str = None, max_tokens: int = 8192, temperature: float = 0.2) -> str:
    client = OpenAI(base_url=BASE_URL, api_key=NVIDIA_API_KEY)

    completion = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
        top_p=0.8,
        max_tokens=max_tokens,
        stream=True,
    )

    chunks = []
    for chunk in completion:
        if chunk.choices and chunk.choices[0].delta.content is not None:
            content = chunk.choices[0].delta.content
            chunks.append(content)
            print(content, end="", flush=True)

    result = "".join(chunks)
    print()  # newline after stream

    if output_file:
        with open(output_file, "w") as f:
            f.write(result)
        print(f"\n[codegen] Written to {output_file}", file=sys.stderr)

    return result


def main():
    parser = argparse.ArgumentParser(description="Generate code via NVIDIA Qwen3-Coder API")
    parser.add_argument("--prompt", help="Prompt string")
    parser.add_argument("--prompt-file", help="Read prompt from file")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument("--max-tokens", type=int, default=8192)
    parser.add_argument("--temperature", type=float, default=0.2)
    args = parser.parse_args()

    if args.prompt_file:
        with open(args.prompt_file) as f:
            prompt = f.read()
    elif args.prompt:
        prompt = args.prompt
    elif not sys.stdin.isatty():
        prompt = sys.stdin.read()
    else:
        print("Error: provide --prompt, --prompt-file, or pipe input", file=sys.stderr)
        sys.exit(1)

    generate(prompt, args.output, args.max_tokens, args.temperature)


if __name__ == "__main__":
    main()
