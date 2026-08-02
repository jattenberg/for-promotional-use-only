from setuptools import setup

required_libraries = [
    "orjson>=3.9",
    "boto3>=1.34",
    "botocore>=1.34",
]

setup(
    name="for-promotional-use-only",
    version="0.0.1",
    description="classic rave mixtapes from the 90s and beyond",
    url="http://github.com/jattenberg/for-promotional-use-only",
    author="jattenberg",
    author_email="josh@attenberg.org",
    license="MIT",
    packages=["for-promotional-use-only"],
    zip_safe=False,
    install_requires=required_libraries,
)
