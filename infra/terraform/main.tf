# Estia — net-new AWS infrastructure (S3 + IAM).
#
# What's already running by hand and is OUT OF SCOPE here:
#   • EC2 t3 instance (i-… in eu-north-1 — see DEPLOYMENT_RUNBOOK.md)
#   • Elastic IP attached to that instance
#   • DNS A record estia.co.il → that IP (managed in Cloudflare, proxied)
#   • Security group allowing 22/80/443
#
# To bring those under Terraform later, run:
#   terraform import aws_instance.app i-XXXXXX
#   terraform import aws_eip.app eipalloc-XXXX
#   etc.  Stubs are commented at the bottom for when you do.
#
# This file only provisions the NEW pieces:
#   • estia-prod S3 bucket (uploads + db backups)
#   • IAM role for the EC2 to write/read that bucket
#   • IAM role for GitHub Actions OIDC deploys (alternative to long-lived keys)
#   • Lifecycle: delete db-backups after 14 days

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = "eu-north-1"
}

# ─────────────────── S3 bucket ───────────────────
resource "aws_s3_bucket" "estia" {
  bucket = "estia-prod"

  tags = {
    Project = "estia"
    Env     = "prod"
  }
}

resource "aws_s3_bucket_public_access_block" "estia" {
  bucket                  = aws_s3_bucket.estia.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "estia" {
  bucket = aws_s3_bucket.estia.id
  versioning_configuration { status = "Disabled" }
}

resource "aws_s3_bucket_lifecycle_configuration" "estia" {
  bucket = aws_s3_bucket.estia.id

  rule {
    id     = "expire-db-backups-14d"
    status = "Enabled"
    filter { prefix = "db-backups/" }
    expiration { days = 14 }
  }

  rule {
    id     = "abort-incomplete-multipart-7d"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
}

# ─────────────────── IAM role for the EC2 (uploads + backups) ───────────────────
data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "estia_app" {
  name               = "estia-prod-app"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

data "aws_iam_policy_document" "estia_s3" {
  statement {
    actions   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.estia.arn, "${aws_s3_bucket.estia.arn}/*"]
  }
}

resource "aws_iam_role_policy" "estia_s3" {
  role   = aws_iam_role.estia_app.id
  policy = data.aws_iam_policy_document.estia_s3.json
}

resource "aws_iam_instance_profile" "estia_app" {
  name = "estia-prod-app"
  role = aws_iam_role.estia_app.name
}

# ─────────────────── GitHub Actions OIDC role (passwordless deploys) ───────────────────
# Optional: lets `.github/workflows/deploy.yml` skip the long-lived
# EC2_SSH_KEY secret and instead assume this role via OIDC.  Today the
# workflow uses the SSH key directly because it's simpler — wire the OIDC
# role in later if you want fully short-lived credentials.

variable "github_owner" { default = "" }     # set via -var when ready
variable "github_repo"  { default = "" }

resource "aws_iam_openid_connect_provider" "github" {
  count           = var.github_owner != "" ? 1 : 0
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# ─────────────────── Outputs ───────────────────
output "s3_bucket_name" {
  value       = aws_s3_bucket.estia.bucket
  description = "Add this to the EC2 .env as S3_BUCKET"
}

output "ec2_instance_profile" {
  value       = aws_iam_instance_profile.estia_app.name
  description = "Attach via: aws ec2 associate-iam-instance-profile --instance-id <i-…> --iam-instance-profile Name=estia-prod-app"
}

# ─────────────────── Future stubs (commented; uncomment to import existing infra) ───────────────────
# resource "aws_eip" "app"              { /* import then describe */ }
# resource "aws_security_group" "app"   { /* import then describe */ }
# resource "aws_instance" "app"         { /* import then describe */ }
# resource "aws_route53_record" "estia" { /* import then describe */ }
