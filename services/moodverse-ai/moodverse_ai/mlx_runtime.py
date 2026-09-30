"""Lazy Apple-Silicon MLX adapters used by the Moodverse AI gateway."""

import json
import os


DEFAULT_TEXT_MODEL_ID = "mlx-community/Qwen3.5-4B-MLX-4bit"
DEFAULT_EMBED_MODEL_ID = "mlx-community/Qwen3-Embedding-0.6B-8bit"
MAX_EMBED_TOKENS = 512
MAX_GENERATION_TOKENS = 512


def _model_id(environ, key, default):
    configured = environ.get(key, "").strip()
    return configured or default


def _short_name(model_id):
    return model_id.rstrip("/").rsplit("/", 1)[-1][:80]


class MLXRuntime:
    """Load only the model needed by a request and cache each loaded model."""

    def __init__(self, vlm_module=None, embedding_loader=None, mlx_core=None, environ=None):
        self._environ = os.environ if environ is None else environ
        self.text_model_id = _model_id(self._environ, "MUSIC_AI_TEXT_MODEL_ID", DEFAULT_TEXT_MODEL_ID)
        self.embedding_model_id = _model_id(self._environ, "MUSIC_AI_EMBED_MODEL_ID", DEFAULT_EMBED_MODEL_ID)
        self._vlm_module = vlm_module
        self._embedding_loader = embedding_loader
        self._mlx_core = mlx_core
        self._text_model = None
        self._text_processor = None
        self._embedding_model = None
        self._embedding_tokenizer = None

    @property
    def text_model_name(self):
        return _short_name(self.text_model_id)

    @property
    def text_model_version(self):
        return self.text_model_id

    @property
    def embedding_model_name(self):
        return _short_name(self.embedding_model_id)

    @property
    def embedding_model_version(self):
        return self.embedding_model_id

    def generate_json(self, prompt):
        """Generate from an instruction role plus a separately encoded data role."""
        try:
            document = json.loads(prompt)
            if not isinstance(document, dict) or set(document) != {"instruction", "untrusted_input"}:
                raise ValueError("invalid gateway prompt")
            instruction = document["instruction"]
            if not isinstance(instruction, str) or not instruction.strip():
                raise ValueError("invalid gateway instruction")
            user_data = json.dumps(document["untrusted_input"], ensure_ascii=False, separators=(",", ":"))

            model, processor, vlm_module = self._load_text_model()
            tokenizer = getattr(processor, "tokenizer", None)
            if tokenizer is None or not callable(getattr(tokenizer, "apply_chat_template", None)):
                raise RuntimeError("text tokenizer unavailable")
            messages = [
                {"role": "system", "content": instruction},
                {"role": "user", "content": user_data},
            ]
            formatted_prompt = tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
                enable_thinking=False,
            )
            result = vlm_module.generate(
                model,
                processor,
                formatted_prompt,
                image=None,
                max_tokens=MAX_GENERATION_TOKENS,
                temperature=0.0,
                verbose=False,
            )
            if not isinstance(result, str):
                result = getattr(result, "text", None)
            if not isinstance(result, str):
                raise RuntimeError("text model returned an unsupported result")
            return result
        except Exception:
            raise RuntimeError("MLX text inference unavailable") from None

    def embed(self, texts):
        """Return the model's mean-pooled normalized vectors for a padded batch."""
        try:
            model, tokenizer, mlx_core = self._load_embedding_model()
            encoded = tokenizer.batch_encode_plus(
                texts,
                return_tensors="mlx",
                padding=True,
                truncation=True,
                max_length=MAX_EMBED_TOKENS,
            )
            outputs = model(**encoded)
            vectors = outputs.text_embeds
            mlx_core.eval(vectors)
            if not callable(getattr(vectors, "tolist", None)):
                raise RuntimeError("embedding model returned an unsupported result")
            return self.embedding_model_name, self.embedding_model_version, vectors.tolist()
        except Exception:
            raise RuntimeError("MLX embedding inference unavailable") from None

    def _load_text_model(self):
        if self._text_model is not None:
            return self._text_model, self._text_processor, self._vlm_module
        try:
            if self._vlm_module is None:
                import mlx_vlm

                self._vlm_module = mlx_vlm
            model, processor = self._vlm_module.load(self.text_model_id)
            if processor is None:
                raise RuntimeError("text processor unavailable")
            self._text_model = model
            self._text_processor = processor
            return model, processor, self._vlm_module
        except Exception:
            raise RuntimeError("MLX text model unavailable") from None

    def _load_embedding_model(self):
        if self._embedding_model is not None:
            return self._embedding_model, self._embedding_tokenizer, self._get_mlx_core()
        try:
            loader = self._embedding_loader
            if loader is None:
                from mlx_embeddings.utils import load

                loader = load
                self._embedding_loader = loader
            model, tokenizer = loader(self.embedding_model_id)
            if tokenizer is None:
                raise RuntimeError("embedding tokenizer unavailable")
            self._embedding_model = model
            self._embedding_tokenizer = tokenizer
            return model, tokenizer, self._get_mlx_core()
        except Exception:
            raise RuntimeError("MLX embedding model unavailable") from None

    def _get_mlx_core(self):
        if self._mlx_core is None:
            try:
                import mlx.core as mlx_core

                self._mlx_core = mlx_core
            except Exception:
                raise RuntimeError("MLX array runtime unavailable") from None
        return self._mlx_core
