# Install basic packages and configure AWS CLI
yum install -y awscli jq amazon-cloudwatch-agent vim
aws configure set region `curl --silent http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region`

# Setup CloudWatch logging.
cat > /root/cloudwatch-config.json << EOF
{
    "agent": {
        "run_as_user": "root"
    },
    "logs": {
        "logs_collected": {
            "files": {
                "collect_list": [
                    {
                        "file_path": "/var/log/logs",
                        "log_group_name": "/_APP_NAME_/",
                        "log_stream_name": "{instance_id}",
                        "retention_in_days": -1
                    }
                ]
            }
        }
    },
    "metrics": {
        "metrics_collected": {
            "statsd": {
                "metrics_aggregation_interval": 60,
                "metrics_collection_interval": 10,
                "service_address": ":1"
            }
        }
    }
}
EOF

/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/root/cloudwatch-config.json

# Connect EFS to EC2 instances
mkdir /root/efs
echo "_EFS_VOLUME_ID_:/ /root/efs efs _netdev,noresvport,tls,iam 0 0" >> /etc/fstab
mount -fav

# Setup processing script
cat > /root/queueProcessor.sh << EOF
#!/bin/bash
aws configure set region `curl --silent http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region`

instanceId=\$(curl --silent http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r '.instanceId');
autoScalingGroupName=\$(aws autoscaling describe-auto-scaling-instances --instance-ids=\$instanceId | jq -r '.AutoScalingInstances[0].AutoScalingGroupName');

queue2=\$(aws ssm get-parameter --name _QUEUE2_URL_PARAMETER_ | jq -r '.Parameter.Value');

while sleep 60;
do

#aws autoscaling set-instance-protection --instance-ids \$instanceId --auto-scaling-group-name \$autoScalingGroupName --protected-from-scale-in

echo "Looking for a message";
message=\$(aws sqs receive-message --queue-url \$queue2)

if [[ -z \$message ]]
then
  echo "No new messages";
else
  echo "Found a message";
  echo \$message;
  receiptHandle=\$(echo \$message | jq -r .Messages[0].ReceiptHandle);
  aws sqs delete-message --queue-url \$queue2 --receipt-handle \$receiptHandle;
  echo "Message Deleted";
fi

#aws autoscaling set-instance-protection --instance-ids \$instanceId --auto-scaling-group-name \$autoScalingGroupName --no-protected-from-scale-in

done;

EOF

chmod +x /root/queueProcessor.sh

# Setup daemon to run processing script
cat > /etc/systemd/system/queue-processor.service << EOF
[Unit]
Description = sqs processor
After = network.target

[Service]
ExecStart = /usr/bin/sh -c "/root/queueProcessor.sh > /var/log/logs 2>&1"

EOF

cd /etc/systemd/system
systemctl enable queue-processor.service
systemctl start queue-processor.service